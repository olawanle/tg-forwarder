"""The DB pool must reuse connections, survive dead ones, and wait when full.

Needs a real Postgres:  TEST_DATABASE_URL=postgresql://... python -m unittest discover -s tests
"""
from __future__ import annotations

import os
import threading
import time
import unittest
from unittest import mock

import psycopg2
from psycopg2 import pool as pg_pool

from forwarder import storage
from forwarder.storage import _ConnectionPool

DSN = os.getenv("TEST_DATABASE_URL", "")


def _query(pool: _ConnectionPool, sql: str = "SELECT 1"):
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            row = cur.fetchone()
        conn.commit()
        return row[0]
    finally:
        pool.putconn(conn)


@unittest.skipUnless(DSN, "TEST_DATABASE_URL not set")
class ConnectionPoolTest(unittest.TestCase):
    def test_concurrent_queries_reuse_a_bounded_set_of_connections(self) -> None:
        pool = _ConnectionPool(DSN, 4)
        errors: list[str] = []

        def worker() -> None:
            try:
                for _ in range(100):
                    _query(pool)
            except Exception as exc:
                errors.append(repr(exc))

        threads = [threading.Thread(target=worker) for _ in range(16)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(errors, [])
        stats = pool.stats()
        self.assertLessEqual(stats["opened_total"], 4)
        self.assertEqual(stats["in_use"], 0)

    def test_connections_killed_while_idle_are_replaced_transparently(self) -> None:
        pool = _ConnectionPool(DSN, 4)
        pid = _query(pool, "SELECT pg_backend_pid()")
        admin = psycopg2.connect(DSN)
        admin.autocommit = True
        admin.cursor().execute("SELECT pg_terminate_backend(%s)", (pid,))
        admin.close()
        time.sleep(0.2)
        with mock.patch.object(storage, "POOL_VALIDATE_AFTER_SECONDS", 0.0):
            self.assertEqual(_query(pool, "SELECT 42"), 42)

    def test_connection_that_dies_in_use_is_not_recycled(self) -> None:
        pool = _ConnectionPool(DSN, 2)
        conn = pool.getconn()
        with conn.cursor() as cur:
            cur.execute("SELECT pg_backend_pid()")
            pid = cur.fetchone()[0]
        conn.commit()
        admin = psycopg2.connect(DSN)
        admin.autocommit = True
        admin.cursor().execute("SELECT pg_terminate_backend(%s)", (pid,))
        admin.close()
        time.sleep(0.2)
        with self.assertRaises(psycopg2.Error):
            conn.cursor().execute("SELECT 1")
        pool.putconn(conn)
        self.assertEqual(pool.stats()["idle"], 0)
        self.assertEqual(_query(pool, "SELECT 7"), 7)

    def test_uncommitted_work_is_rolled_back_on_return(self) -> None:
        pool = _ConnectionPool(DSN, 1)
        conn = pool.getconn()
        conn.cursor().execute("CREATE TEMP TABLE pool_leak_check(x int)")
        pool.putconn(conn)
        self.assertTrue(_query(pool, "SELECT to_regclass('pg_temp.pool_leak_check') IS NULL"))

    def test_full_pool_makes_callers_wait_then_times_out_cleanly(self) -> None:
        pool = _ConnectionPool(DSN, 1)
        held = pool.getconn()
        waited: list[float] = []

        def late() -> None:
            start = time.monotonic()
            _query(pool)
            waited.append(time.monotonic() - start)

        t = threading.Thread(target=late)
        t.start()
        time.sleep(0.3)
        pool.putconn(held)
        t.join()
        self.assertGreater(waited[0], 0.25)

        held = pool.getconn()
        with mock.patch.object(storage, "POOL_ACQUIRE_TIMEOUT", 0.2):
            with self.assertRaises(pg_pool.PoolError):
                pool.getconn()
        pool.putconn(held)
        self.assertEqual(pool.stats()["in_use"], 0)
        self.assertEqual(_query(pool), 1)


if __name__ == "__main__":
    unittest.main()
