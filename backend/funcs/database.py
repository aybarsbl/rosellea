import time
from typing import Literal
import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from funcs import speaker


class Messages:
    def __init__(
        self,
        url: str,
        speaker: speaker.Speaker,
        connect: bool = True,
        restart: bool = False,
    ):
        self._url = url
        self._speaker = speaker
        self.is_success = False

        self._table = "messages"

        if connect:
            self.is_success = self._connection()

        if restart:
            self.delete(-1)

    def _connect(self):
        return psycopg.connect(self._url, row_factory=dict_row)

    def _connection(self) -> bool:
        for _ in range(3):
            try:
                with psycopg.connect(self._url, connect_timeout=5) as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1")
                        cur.fetchone()
                self._create_table()
                return True
            except Exception:
                time.sleep(2)
        print("HATA: Veritabanına Bağlantı Başarısız!")
        return False

    def _create_table(self):
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql.SQL("""
                        CREATE TABLE IF NOT EXISTS {} (
                            id SERIAL PRIMARY KEY,
                            role VARCHAR(16) NOT NULL,
                            content TEXT NOT NULL,
                            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    """).format(sql.Identifier(self._table)))
            conn.commit()

    def insert(
        self,
        role: Literal["system", "user", "assistant"],
        content: str,
        speak: bool = True,
        print_all: bool = True,
    ):
        if not content:
            return
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL("SELECT COUNT(*) AS n FROM {}").format(
                        sql.Identifier(self._table)
                    )
                )
                count = cur.fetchone()["n"]

                if count == 0 and role != "system":
                    return

                if role == "system" and count > 0:
                    cur.execute(
                        sql.SQL(
                            "UPDATE {} SET role = %s, content = %s "
                            "WHERE id = (SELECT id FROM {} ORDER BY id LIMIT 1)"
                        ).format(
                            sql.Identifier(self._table),
                            sql.Identifier(self._table),
                        ),
                        (role, content.strip()),
                    )
                else:
                    cur.execute(
                        sql.SQL(
                            "INSERT INTO {} (role, content) VALUES (%s, %s)"
                        ).format(sql.Identifier(self._table)),
                        (role, content.strip()),
                    )
            conn.commit()

        if print_all:
            # Tüm geçmişi yeniden yazdırmak yerine sadece bu mesajı bas —
            # uzun konuşmalarda terminal spam'ini önler.
            role_label = f"[{role.title()}]"
            print(f"{role_label.ljust(11)} : {content.strip()}")
        if role == "assistant" and speak:
            self._speaker.speak(content.strip())

    def update(
        self,
        role: Literal["system", "user", "assistant"],
        content: str,
        id: int = 1,
    ):
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        "UPDATE {} SET role = %s, content = %s WHERE id = %s"
                    ).format(sql.Identifier(self._table)),
                    (role, content, id),
                )
            conn.commit()

    def delete(self, id: int):
        with self._connect() as conn:
            with conn.cursor() as cur:
                if id == -1:
                    cur.execute(
                        sql.SQL("TRUNCATE TABLE {} RESTART IDENTITY").format(
                            sql.Identifier(self._table)
                        )
                    )
                else:
                    cur.execute(
                        sql.SQL("DELETE FROM {} WHERE id = %s").format(
                            sql.Identifier(self._table)
                        ),
                        (id,),
                    )
            conn.commit()

    def select_all(self, for_gpt: bool = True):
        messages = []
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL("SELECT * FROM {} ORDER BY id").format(
                        sql.Identifier(self._table)
                    )
                )
                for row in cur.fetchall():
                    if for_gpt:
                        messages.append(
                            {"role": row["role"], "content": row["content"]}
                        )
                    else:
                        messages.append(
                            {
                                "id": row["id"],
                                "role": row["role"],
                                "content": row["content"],
                                "date": row["date"],
                            }
                        )
        return messages

    def printer(self, print_system: bool = True):
        messages = self.select_all()
        for message in messages:
            if not print_system and message["role"] == "system":
                continue
            role_label = f"[{message['role'].title()}]"
            content = message["content"]
            print(f"{role_label.ljust(11)} : {content}")
        print("\n\nSorgu: ", end=" ")
