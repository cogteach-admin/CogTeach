import os.path
from csv import writer

import pandas as pd

from .dataformat import RecordType


class CSVLogger:
    """Materialize the received information posted from users.

    Posted data are stored in the format of csv.
    The structure of the file that stores gaze information shows as follows:
    (Note that the slide_id is associated with gaze, while the aoi_id is associated with fixations.)
    ===== ===== ===== ===== ===== ===== ===== ===== ===== ===== ===== =====
    timestamp gaze_x gaze_y fixation_seq fixation_x fixation_y slide_id aoi_id lecture_id group_id client_width client_height
    ===== ===== ===== ===== ===== ===== ===== ===== ===== ===== ===== =====

    The structure of the confusion information shows as follows:
    ===== ===== ===== ===== =====
    timestamp slide_id aoi_id lecture_id group_id
    ===== ===== ===== ===== =====

    The structure of the mouse click information shows as follows:
    (Note that the slide_id and aoi_id can be NaN if the user was not clicking on AoIs)
    ===== ===== ===== ===== ===== ===== =====
    timestamp mouse_x mouse_y slide_id aoi_id lecture_id group_id
    ===== ===== ===== ===== ===== ===== =====
    """
    headers = {
        RecordType.GAZE: ["timestamp", "gaze_x", "gaze_y", "fixation_seq", "fixation_x", "fixation_y",
                          "slide_id", "aoi_id", "lecture_id", "group_id", "client_width", "client_height"],
        RecordType.CONFUSION: ["timestamp", "slide_id", "aoi_id", "lecture_id", "group_id"],
        RecordType.CLICK: ["timestamp", "event", "mouse_x", "mouse_y", "slide_id", "aoi_id", "lecture_id", "group_id"],
        RecordType.INATTENTION: ["timestamp", "reason", "lecture_id", "group_id"],
        # async talk data
        RecordType.GAZE_ASYNC: ["timestamp", "gaze_x", "gaze_y", "lecture_id", "group_id", "client_width",
                                "client_height"],
        RecordType.CONFUSION_ASYNC: ["timestamp", "x_coord", "y_coord", "lecture_id", "group_id"],
        RecordType.CLICK_ASYNC: ["timestamp", "event", "mouse_x", "mouse_y", "lecture_id", "group_id"],
    }

    def __init__(self, filepath, gunicorn_logger):
        self.filepath = filepath
        self.gunicorn_logger = gunicorn_logger

        if not os.path.exists(filepath):
            os.makedirs(filepath)

        self.file_objects = {}
        self.writers = {}

        self.fixation_seqs = {}

    def __call__(self, *args, **kwargs):
        self.log(*args, **kwargs)

    def terminate(self):
        """Terminate the logger by closing all file handlers."""
        for file_object_dict in self.file_objects.values():
            for file_object in file_object_dict.values():
                file_object.close()

    def refresh(self):
        """Refresh the internal status."""
        self.terminate()
        self.file_objects = {}
        self.writers = {}

    def flush(self):
        """Flush all file objects."""
        for file_object_dict in self.file_objects.values():
            for file_object in file_object_dict.values():
                file_object.flush()

    def log(self, record_type, record_stu_num, record_body):
        """Write the record into the CSV.

        This is the common entry point and wraps all the other actual methods.
        """
        if record_stu_num not in self.writers:
            self.add_new_user(record_stu_num)

        csv_writer = self.writers[record_stu_num][record_type]

        if record_type == RecordType.GAZE:
            # got a gaze record.
            rows = self.record_to_gaze_rows(record_stu_num, record_body)
        elif record_type == RecordType.GAZE_ASYNC:
            # got a async gaze record.
            rows = self.record_to_async_gaze_rows(record_body)
        else:
            # got a confusion record
            rows = self.record_to_rows(record_type, record_body)

        self.gunicorn_logger.info(
            "Writing {}: stu. #{}:{} data points(s)".format(record_type.name, record_stu_num, len(rows)))
        csv_writer.writerows(rows)

    def add_new_user(self, stu_num):
        """Create new files and writer for a new user.

        :param stu_num: The student identification.
        """
        self.fixation_seqs[stu_num] = 0
        self.file_objects[stu_num] = {}
        self.writers[stu_num] = {}

        for record_type in RecordType:
            filename = os.path.join(self.filepath, "{}_{}.csv".format(stu_num, record_type.name.lower()))
            write_header = not os.path.isfile(filename)

            file_object = open(
                file=filename,
                mode="a",
                newline=""
            )
            self.file_objects[stu_num][record_type] = file_object
            self.writers[stu_num][record_type] = writer(file_object)

            if write_header:
                # A new file. Write the header
                self.writers[stu_num][record_type].writerow(CSVLogger.headers[record_type])

    def record_to_gaze_rows(self, record_stu_num, record_body) -> list:
        """Convert gaze record body to rows of csv files.

        :param record_stu_num: The student identification.
        :param record_body: The main content in a record.
        For gaze record, the structure of its body/main content follows:
            A dictionary with the following fields:
            1. `gaze`: The gaze points. A dictionary containing fields: x, y, timestamp, clientWidth, clientHeight.
            2. `fixations`: A list of Fixations. See `gaze/gaze_classes.py` for definition of Fixation.
            3. `slide_id`: The current id of the slide.
            4. `lecture_id`: The id of current lecture.
            5. `group_id`: The id of the group that the student is assigned to.
            6. `aoi_ids`: A list of the classification result of fixations w.r.t. AoIs.
        :return: A list of rows in the csv file with the following fields:
            (Note that the slide_id is associated with gaze, while the aoi_id is associated with fixations.)
            ===== ===== ===== ===== ===== ===== ===== ===== ===== ===== ===== =====
            timestamp gaze_x gaze_y fixation_seq fixation_x fixation_y slide_id aoi_id lecture_id group_id client_width client_height
            ===== ===== ===== ===== ===== ===== ===== ===== ===== ===== ===== =====
        """
        df = pd.DataFrame(columns=CSVLogger.headers[RecordType.GAZE])

        df["timestamp"] = record_body["gaze"]["timestamp"]
        df["gaze_x"] = record_body["gaze"]["x"]
        df["gaze_y"] = record_body["gaze"]["y"]
        df["client_width"] = record_body["gaze"]["clientWidth"]
        df["client_height"] = record_body["gaze"]["clientHeight"]

        aoi_ids = record_body["aoi_ids"]
        for i, fixation in enumerate(record_body["fixations"]):
            fixation_loc_slice = range(*fixation.indexslice)
            df.loc[fixation_loc_slice, "fixation_seq"] = self.fixation_seqs[record_stu_num]
            df.loc[fixation_loc_slice, "fixation_x"] = fixation.x
            df.loc[fixation_loc_slice, "fixation_y"] = fixation.y
            df.loc[fixation_loc_slice, "aoi_id"] = aoi_ids[i]

        df["slide_id"] = record_body["slide_id"]
        df["lecture_id"] = record_body["lecture_id"]
        df["group_id"] = record_body["group_id"]

        return df.values.tolist()

    @staticmethod
    def record_to_async_gaze_rows(record_body) -> list:
        """Convert gaze record body to rows of csv files.

        :param record_body: The main content in a record.
        For gaze record, the structure of its body/main content follows:
            A dictionary with the following fields:
            1. `gaze`: The gaze points. A dictionary containing fields: x, y, timestamp, clientWidth, clientHeight.
            2. `lecture_id`: The id of current lecture.
            3. `group_id`: The id of the group that the student is assigned to.
            4. `academic_level`: The academic level of the student.
        :return: A list of rows in the csv file with the following fields:
            (Note that the slide_id is associated with gaze, while the aoi_id is associated with fixations.)
            ===== ===== ===== ===== ===== ===== ===== ===== ===== ===== ===== =====
            timestamp gaze_x gaze_y lecture_id group_id client_width client_height
            ===== ===== ===== ===== ===== ===== ===== ===== ===== ===== ===== =====
        """
        df = pd.DataFrame(columns=CSVLogger.headers[RecordType.GAZE_ASYNC])

        df["timestamp"] = record_body["gaze"]["timestamp"]
        df["gaze_x"] = record_body["gaze"]["x"]
        df["gaze_y"] = record_body["gaze"]["y"]
        df["client_width"] = record_body["gaze"]["clientWidth"]
        df["client_height"] = record_body["gaze"]["clientHeight"]

        df["lecture_id"] = record_body["lecture_id"]
        df["group_id"] = record_body["group_id"]

        return df.values.tolist()

    def get_status_summary(self):
        """Returns a dictionary of the current status of CSV logger."""
        return {
            "filepath": self.filepath,
            "writers": {
                "stu_nums": list(self.writers.keys()),
                "writers": [repr(w) for writers in self.writers.values() for w in writers.values()]
            },
            "files": {
                "stu_nums": list(self.file_objects.keys()),
                "files": [repr(f) for files in self.file_objects.values() for f in files.values()]
            },
            "fixation_seqs": {
                "stu_nums": list(self.fixation_seqs.keys()),
                "seqs": list(self.fixation_seqs.values()),
            }
        }

    @staticmethod
    def record_to_rows(record_type, record_body) -> list:
        """Convert async mouse event record body to rows of csv files.
        :param record_type confusion/inattention/mouse_event
        :param record_body: The main content in a record.
        """

        if record_type in [RecordType.INATTENTION]:
            record_name = "inattention"
        elif record_type in [RecordType.CLICK, RecordType.CLICK_ASYNC]:
            record_name = "mouse_events"
        elif record_type in [RecordType.CONFUSION, RecordType.CONFUSION_ASYNC]:
            record_name = "confusion"
        else:
            return []

        lecture_id = record_body["lecture_id"]
        group_id = record_body["group_id"]
        result = []
        for record in record_body[record_name]:
            # print(record)
            result.append(record + [lecture_id, group_id])
        return result