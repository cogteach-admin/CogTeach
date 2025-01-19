from collections import namedtuple
from typing import Dict

import numpy as np

Gaze = namedtuple("Gaze", ["x", "y"])


class Fixation:
    def __init__(self, x_coords, y_coords, timeslice, indexslice=(0, 0)):
        """Create a representative of a fixation.

        :param x_coords: The x coordinates of gaze points.
        :param y_coords: The y coordinates of gaze points.
        :param timeslice: The timestamps of gaze points.
        :param indexslice: The indices of gaze points. (start_index, end_index). (For testing confusion classifiers.
            In actual use can ignore this argument and use the default value (0, 0).)
        """
        self.x_all = x_coords
        self.y_all = y_coords

        self.x = x_coords.mean()
        self.x_max = x_coords.max()
        self.x_min = x_coords.min()
        self.x_median = np.median(x_coords)

        self.y = y_coords.mean()
        self.y_max = y_coords.max()
        self.y_min = y_coords.min()
        self.y_median = np.median(y_coords)

        self.start = timeslice[0]
        self.end = timeslice[-1]
        self.duration = self.end - self.start

        self.indexslice = indexslice

    def mad(self):
        """Get the median absolute deviation of x and y

        mad = median(|x_i - median(x)|)

        :return (mad_x, mad_y)
        """
        return np.median(np.abs(self.x_all - self.x_median)), np.median(np.abs(self.y_all - self.y_median))

    def minimize(self):
        """Return a minimal set of properties can be used on the client side.

        :return A dictionary contains:
            - center: The x, y coordinate of the center point (may not be a actual gaze point).
            - upperleft: The x, y coordinate of the upper-left-most gaze point.
            - lowerright: The x, y coordinate of the lower-right-most gaze point.
            - duration: The time duration of the saccade.
            - gazecount: The total number of gaze points included in the fixation.
        """
        return {
            "center": (self.x, self.y),
            "upperleft": (self.x_min, self.y_min),
            "lowerright": (self.x_max, self.y_max),
            "duration": self.duration,
            "gazecount": self.x_all.shape[0],
        }


class Saccade:
    def __init__(self, x_coords, y_coords, vx, vy, timeslice, indexslice=(0, 0)):
        """Create a representative of a saccade.

        :param x_coords: The x coordinates of gaze points.
        :param y_coords: The y coordinates of gaze points.
        :param vx: The velocity of gaze points in the x-axis.
        :param vy: The velocity of gaze points in the y-axis.
        :param timeslice: The timestamps of gaze points.
        :param indexslice: The indices of gaze points. (start_index, end_index). (For testing confusion classifiers.
            In actual use can ignore this argument and use the default value (0, 0).)
        """
        self.x_all = x_coords
        self.y_all = y_coords
        self.vx_all = vx
        self.vy_all = vy

        self.x_start = x_coords[0]
        self.x_end = x_coords[-1]

        self.y_start = y_coords[0]
        self.y_end = y_coords[-1]

        self.start = timeslice[0]
        self.end = timeslice[-1]
        self.duration = self.end - self.start

        self.indexslice = indexslice

    def minimize(self):
        """Return a minimal set of properties can be used on the client side.

        :return A dictionary contains:
            - startpoin: The x, y coordinate of the saccade start gaze point.
            - endpoint: The x, y coordinate of the saccade end gaze point.
            - length: Euclidean distance between the start gaze point and end gaze point.
            - duration: The time duration of the saccade.
        """
        return {
            "startpoint": (self.x_start, self.y_start),
            "endpoint": (self.x_end, self.y_end),
            "length": np.linalg.norm((self.x_end - self.x_start, self.y_start, self.y_end)),
            "duration": self.duration
        }


class AoI:
    def __init__(self, upper_left_point, lower_right_point, confusion_count, student_count, fixation_count,
                 total_fixation_count):
        """Create a representative of the area of interest (AoI).

        :param upper_left_point: The x, y coordinate of the upper left point.
        :param lower_right_point: The x, y coordinate of the lower right point.
        :param confusion_count:
        :param student_count:
        :param fixation_count:
        :param total_fixation_count:
        """
        self.upper_left_point = upper_left_point
        self.lower_right_point = lower_right_point
        self.confusion_count = confusion_count
        self.student_count = student_count
        self.fixation_count = fixation_count
        self.total_fixation_count = total_fixation_count

    def minimize(self):
        """Return a minimal set of properties can be used on the client side.

        :return A dictionary contains:
            - upper_left_point: The x, y coordinate of the upper-left corner point.
            - lower_right_point: The x, y coordinate of the lower-right corner point.
            - status: The percentage of students reported confusion over all students in this AoI.
            - percentage: The percentage of students who pay attention to this AoI.
        """
        return {
            "upper_left_point": self.upper_left_point,
            "lower_right_point": self.lower_right_point,
            "status": self.confusion_count / self.student_count if self.student_count > 0 else 0,
            "percentage": self.fixation_count / self.total_fixation_count if self.student_count > 0 else 0,
        }


class TransitionMatrix:
    def __init__(self):
        """Create a representative of transitions between areas of interest (AoIs)."""
        pass


StudentInfo = namedtuple("StudentInfo", ["fixation_count", "confusion_reports",
                                         "inattention_count", "timestamp"])
"""Represents the information associated with a student."""


def aoi_builder(ordered_rectangles: list, student_information: Dict[str, StudentInfo],
                return_confusion_ratio: bool = False, return_inattention_ratio: bool = False) -> tuple:
    """Construct AoIs for students.

    :param ordered_rectangles: A list a AoI positions (rectangles). The rectangles should be ordered.
        1) from left to the right and then 2) from the top to the bottom.
        See also SaliencyClusterer.sort_chulls_by_rectangles() in gaze.clusterer.
    :param student_information: A dictionary containing posted information for each student.
        - fixation_count: A list containing fixation counts in each AoI for each student.
            The position of the entries are aoi_id implicitly, and each entry is fixation counts.
        - confusion_reports: A list of containing confusion in each AoI reported by each student.
            The entries are tuples of (slide_id, aoi_id).
        - inattention_count: ! THIS IS NOT USED, SINCE AOIs DO NOT CONTAIN INATTENTION INFO. !
            A list containing inattention count detected from each student.
    :param return_confusion_ratio: Specified whether the confused student count should be returned.
        Confusion ratio: # confused student / # students
    :param return_inattention_ratio: Specified whether the inattentive student count should be returned.
        Inattention ratio: # inattentive student / # students
    :return: A tuple containing: 1) a list of AoIs, 2) optional the ratio of confused students,
        3) optional the ratio of inattentive students

    """
    aoi_list = []

    total_students = len(student_information)
    total_aois = len(ordered_rectangles)

    student_count_in_aoi = np.zeros((total_aois,))
    fixation_count_in_aoi = np.zeros((total_aois,))
    confusion_count_in_aoi = np.zeros((total_aois,))
    confusion_count = 0  # this is for the general confusion information
    inattention_count = 0  # this is for the general inattention information
    for info in student_information.values():
        fixation_count_in_aoi = fixation_count_in_aoi + np.array(info.fixation_count)
        student_count_in_aoi[np.array(info.fixation_count) > 0] += 1
        # For the general inattention information, one student should only count once.
        inattention_count += min(1, info.inattention_count)
        # For the general confusion information, one student should only count once.
        confusion_count += min(1, len(info.confusion_reports))
        # Assign the confusion information with each AoI
        for record in info.confusion_reports:
            aoi_id = record[1]
            confusion_count_in_aoi[aoi_id] += 1
            if not info.fixation_count[aoi_id] > 0:
                # confusion is reported in this aoi, but no fixation falls in the aoi
                # we should compensate the student count in this aoi
                student_count_in_aoi[aoi_id] += 1

    for aoi_id, rectangle in enumerate(ordered_rectangles):
        aoi_list.append(
            AoI(rectangle[0], rectangle[1], confusion_count_in_aoi[aoi_id], student_count_in_aoi[aoi_id],
                fixation_count_in_aoi[aoi_id], fixation_count_in_aoi.sum()).minimize()
        )

    # T = TransitionMatrix()

    results = [aoi_list]
    if return_confusion_ratio:
        confusion_ratio = confusion_count / total_students
        results.append(confusion_ratio)

    if return_inattention_ratio:
        inattention_ratio = inattention_count / total_students
        results.append(inattention_ratio)

    return tuple(results)
