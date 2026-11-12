"""The Telegram client must stay inert between the app's own requests.

Regression guard for the recurring production slowdown: Telethon's update
loop, left running, downloads every message from every group a broadcast
has sent to. Run with:  python -m unittest discover -s tests
"""
from __future__ import annotations

import asyncio
import datetime
import unittest

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl import types

from forwarder.telegram_service import TelegramService, _known_input_peer, _SendOnlyClient


def _result_of_sending_to_a_supergroup() -> types.Updates:
    now = datetime.datetime.now(datetime.timezone.utc)
    return types.Updates(
        updates=[
            types.UpdateNewChannelMessage(
                message=types.Message(
                    id=10, peer_id=types.PeerChannel(123), date=now, message="hi", out=True
                ),
                pts=5000,
                pts_count=1,
            )
        ],
        users=[],
        chats=[],
        date=now,
        seq=0,
    )


class SendOnlyClientTest(unittest.TestCase):
    def test_service_builds_send_only_clients(self) -> None:
        self.assertIsInstance(TelegramService(1, "hash", "")._client(), _SendOnlyClient)

    def test_stock_client_does_queue_send_results_for_catch_up(self) -> None:
        # Control: the stock client exhibits the behaviour the next test
        # asserts is gone, even with receive_updates=False.
        stock = TelegramClient(StringSession(), 1, "hash", receive_updates=False)
        stock._sender._store_own_updates(_result_of_sending_to_a_supergroup())
        self.assertEqual(stock._updates_queue.qsize(), 1)

    def test_send_results_are_not_queued_for_catch_up(self) -> None:
        client = TelegramService(1, "hash", "")._client()
        client._sender._store_own_updates(_result_of_sending_to_a_supergroup())
        self.assertEqual(client._updates_queue.qsize(), 0)

    def test_update_loop_returns_immediately_and_tracks_nothing(self) -> None:
        client = TelegramService(1, "hash", "")._client()
        asyncio.run(asyncio.wait_for(client._update_loop(), timeout=1))
        self.assertTrue(client._message_box.is_empty())


class KnownInputPeerTest(unittest.TestCase):
    def test_supergroup_with_hash_matches_what_telethon_builds_from_the_entity(self) -> None:
        from telethon import utils

        entity = types.Channel(
            id=1828028586, title="g", photo=types.ChatPhotoEmpty(), date=None,
            access_hash=8898552007579723299, megagroup=True,
        )
        marked_id = utils.get_peer_id(entity)
        self.assertEqual(
            _known_input_peer(marked_id, entity.access_hash), utils.get_input_peer(entity)
        )

    def test_basic_group_needs_no_hash(self) -> None:
        self.assertEqual(_known_input_peer(-4455667, None), types.InputPeerChat(4455667))

    def test_supergroup_without_hash_falls_back_to_lookup(self) -> None:
        self.assertIsNone(_known_input_peer(-1001828028586, None))


if __name__ == "__main__":
    unittest.main()
