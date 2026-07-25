from aiogram.types import KeyboardButton, ReplyKeyboardMarkup


MAIN_MENU = ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text="Connect Telegram Account"), KeyboardButton(text="My Accounts")],
        [KeyboardButton(text="My Groups"), KeyboardButton(text="Message Templates")],
        [KeyboardButton(text="Campaigns"), KeyboardButton(text="Schedule Campaign")],
        [KeyboardButton(text="Statistics"), KeyboardButton(text="Settings")],
    ],
    resize_keyboard=True,
)
