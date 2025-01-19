from collections import namedtuple
from enum import IntEnum
from typing import NamedTuple, Any

TestInfo = namedtuple("TestInfo", ["timestamp"])


class RecordType(IntEnum):
    """Describes the identity of the user."""
    GAZE = 1
    CONFUSION = 2
    CLICK = 3
    INATTENTION = 4
    GAZE_ASYNC = 5
    CONFUSION_ASYNC = 6
    CLICK_ASYNC = 7


class Role(IntEnum):
    """Describes the identity of the user."""
    STUDENT = 1
    TEACHER = 2


class Record(NamedTuple):
    """Describes a record (one row in the CSV)."""
    type: RecordType
    stu_num: str
    body: Any


class MockLock:
    """Mocking the multiprocessing lock. Implements the context manager protocol."""

    def __enter__(self):
        pass

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


class MockValue:
    """Mocking the multiprocessing value. Implements the context manager protocol."""

    def __init__(self, v):
        self.value = v
