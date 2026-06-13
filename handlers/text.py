from __future__ import annotations

import uuid
import random
from telegram.ext import ContextTypes, MessageHandler, filters
from telegram import ReactionTypeEmoji
import logging

from bot.context import BotContext
from bot.platforms import detect_platform, sample_urls_text
from processors.generic import process_generic
from processors.youtube import process_youtube


def text_handler(ctx: BotContext) -> MessageHandler:
    async def _handle(update, context: ContextTypes.DEFAULT_TYPE):
        message = update.message
        if not message or not message.text:
            return

        text = message.text.strip()
        platform = detect_platform(text)
        if not platform:
            await message.reply_text("URL tidak valid atau tidak didukung.\n" + sample_urls_text())
            return

        req_id = uuid.uuid4().hex[:12]
        # React to user's message with a conservative emoji set; try a few in case some are disallowed
        reactions = ["👍", "❤️", "🔥", "🎉", "👏", "😮", "😢"]
        try:
            pool = reactions[:]
            random.shuffle(pool)
            reacted = False
            for emoji in pool:
                try:
                    ok = await context.bot.set_message_reaction(
                        chat_id=message.chat_id,
                        message_id=message.message_id,
                        reaction=[ReactionTypeEmoji(emoji=emoji)],
                    )
                    if ok:
                        reacted = True
                        break
                except Exception:
                    continue
            if not reacted:
                logging.getLogger("bot").warning("Could not add reaction (all emojis failed) chat=%s msg=%s", message.chat_id, message.message_id)
        except Exception:
            logging.getLogger("bot").warning("Failed to add reaction", exc_info=True)
        processing_msg = await message.reply_text(f"Sedang memproses link kamu dari {platform.upper()}...")

        user_id = message.from_user.id if message.from_user else 0
        sem = ctx.semaphores.for_user(user_id)
        async with sem:
            try:
                if platform == "youtube":
                    # YouTube is intentionally special: we do not auto-upload the video file.
                    # Instead we present quality selection buttons (see process_youtube).
                    await process_youtube(ctx, platform=platform, message=message, url=text, req_id=req_id, user_id=user_id)
                else:
                    # All other platforms (tiktok, instagram, facebook, douyin, threads, ...)
                    # now use the unified /aio endpoint + generic processor.
                    await process_generic(ctx, platform=platform, message=message, url=text, req_id=req_id, user_id=user_id)
            finally:
                try:
                    await processing_msg.delete()
                except Exception:
                    pass

    return MessageHandler(filters.TEXT & ~filters.COMMAND, _handle)
