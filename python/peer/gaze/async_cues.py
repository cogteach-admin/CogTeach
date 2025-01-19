import json
import math
import os
from collections import namedtuple

import cv2
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.collections import PatchCollection
from matplotlib.patches import Polygon
from tqdm import trange
from webvtt import WebVTT, Caption

from clusterer import SaliencyClusterer
from gaze_classes import Gaze, StudentInfo, aoi_builder

ChullNamedtuple = namedtuple("ChullNamedtuple", ["start", "end", "chull_list"])
AoIWithTime = namedtuple("AoIWithTime", ["start", "end", "slide_id", "aoi_list"])


class Chull:
    def __init__(self, start=0, end=0, chull_list=[]):
        self.start = start
        self.end = end
        self.chull_list = chull_list


def chull_to_original_size(chulls, shape):
    """
    Convert convex hulls from 0-1 scale to pixel scale.
    :param chulls: A list of convex hulls.
    :param shape: A list of width and height of the original image.
    :return:
    """
    height, width = shape
    new_chulls = []
    for chull in chulls[:]:
        new_chull = []
        for x, y in chull:
            new_chull.append([x * width, y * height])
        new_chulls.append(new_chull)
    return new_chulls


def visualize_convex_hulls(pic, chulls):
    """
    Returns an array of the image that visualizes the convex hull over the provided picture.
    :param pic: The original image which convex hulls are detected.
    :param chulls: A list of convex hulls to be visualized.
    :return: An array can be plotted directly in BGRA order.
    """
    nclass = len(chulls)
    color = plt.cm.get_cmap('viridis', nclass)

    patches = []
    for i in range(nclass):
        polygon = Polygon(np.array(chulls[i]), closed=False)
        patches.append(polygon)
    p = PatchCollection(patches, alpha=0.4)
    p.set_array(range(nclass))

    fig, ax = plt.subplots(figsize=(20, 12))
    canvas = FigureCanvasAgg(fig)
    ax.imshow(pic, cmap=plt.cm.gray)
    ax.add_collection(p)
    canvas.draw()
    arr = cv2.cvtColor(np.asarray(canvas.buffer_rgba()), cv2.COLOR_RGBA2BGRA)
    plt.close(fig)
    return arr


def video_to_chulls(video_filename, clusterer: SaliencyClusterer, interval=1, interactive=False):
    """
    Converting a video to a list of convex hulls.
    :param video_filename: The filename of the video to be processed
    :param clusterer: The clusterer that detects salient regions from frames.
    :param interval: The interval to read a frame from the video, in frame.
    :param interactive: Whether the process of calculation is interactive or not.
    :return: A list of convex hulls for each slide.
    """
    cap = cv2.VideoCapture(video_filename)
    length = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)  # Gets the frames per second

    count = 0

    # a list containing all the chull information
    all_chulls = []
    start = count / fps
    old_chull = []

    # Check if camera opened successfully
    if not cap.isOpened():
        print("Error opening video stream or file")

    for frame_count in trange(math.floor(length / interval)):
        # Capture frame-by-frame
        ret, frame = cap.read()
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if ret:
            # calculate the chull from the frame
            # print(f"Frame #{frame_count} shape {frame.shape}")
            new_chull = clusterer.get_salient_regions_hierarchy(frame)

            if interactive:
                cv2.imshow('Frame', visualize_convex_hulls(frame, chull_to_original_size(new_chull, frame.shape)))
                key = cv2.waitKey(0)

                if key & 0xFF == ord('c'):
                    if len(old_chull) == 0:
                        # old_chull is not updated yet
                        print("old chull not initialized")
                        old_chull = new_chull.copy()
                    elif not is_chull_same(new_chull, old_chull, 0.1):
                        # chull is different
                        all_chulls.append(ChullNamedtuple(
                            start, count / fps, old_chull.copy()
                        ))

                        print(f"adding new chull, now length {len(all_chulls)}")

                        start = count / fps
                        old_chull = new_chull

                    count += interval
                    cap.set(cv2.CAP_PROP_POS_FRAMES, count)
                elif key & 0xFF == ord('q'):
                    break
            else:
                if len(old_chull) == 0:
                    # old_chull is not updated yet
                    old_chull = new_chull
                elif not is_chull_same(new_chull, old_chull, 0.1):
                    # chull is different
                    all_chulls.append(ChullNamedtuple(
                        start, count / fps, old_chull.copy()
                    ))

                    start = count / fps
                    old_chull = new_chull

                count += interval
                cap.set(cv2.CAP_PROP_POS_FRAMES, count)
        else:
            break

    if len(old_chull) != 0:
        print("Adding the last chull")
        all_chulls.append(ChullNamedtuple(start, count / fps, old_chull.copy()))

    cap.release()
    cv2.destroyAllWindows()
    return all_chulls


def is_chull_same(new_chull_list, old_chull_list, threshold):
    """
    Compares where two list of convex hulls are almost the same.
    :param new_chull_list: The list of new convex hulls.
    :param old_chull_list: The list of old convex hulls.
    :param threshold: The threshold to allow small fluctuation in convex hull coordinate.
    :return:
    """
    if len(new_chull_list) != len(old_chull_list):
        # the number of salient regions are different
        # print(f"chull list size different: new {len(new_chull_list)}, old {len(old_chull_list)}")
        return False
    else:
        # the number of salient regions are the same
        # check if the coordinates are similar
        dist = 0
        for (new_chull, old_chull) in zip(new_chull_list, old_chull_list):
            # new_chull, old_chull: n_coordinate x 2 or 4 (rectangle) x 2
            new_center = np.array(new_chull).mean(axis=0)
            old_center = np.array(old_chull).mean(axis=0)
            dist += np.linalg.norm(new_center - old_center)

        # print(f"Distance: {dist}")
        return dist < threshold


def gaze_to_aois(all_chulls, clusterer: SaliencyClusterer, gaze_dfs, update_interval: int):
    """
    Align gaze data to the list of all salient regions.
    :param all_chulls: A list of the convex hulls detected from each slide.
    :param clusterer: The cluster that assigns gaze points to clusters.
    :param gaze_dfs: A list of dataframes that contains gaze of all participants.
    :param update_interval: The interval for calculating the attention distribution again within a slide.
    :return:
    """
    all_aois = []
    for slide_id, chull in enumerate(all_chulls):
        n_classes = len(chull.chull_list)
        _, rectangles = clusterer.sort_chulls_by_rectangles(chull.chull_list)
        print("=" * 20)
        print(f"Chull #{slide_id} n_classes {n_classes}")

        n_updates = math.ceil((chull.end - chull.start) / update_interval)
        print(f"duration: {chull.end - chull.start}, number of updates {n_updates}")

        for update_counter in range(n_updates):
            update_start = chull.start + update_counter * update_interval
            update_end = min(update_start + update_interval, chull.end)

            print(
                f"#{update_counter}: {millis_to_vtt_timestamp(update_start * 1000)} ---> {millis_to_vtt_timestamp(update_end * 1000)}")

            student_info = {}
            for [student_id, gaze_df] in gaze_dfs.items():
                in_range_df = gaze_df.loc[
                    (gaze_df["relative_timestamp"] >= update_start) & (gaze_df["relative_timestamp"] < update_end)
                    ]

                if in_range_df.shape[0] == 0:
                    continue

                gazes = in_range_df.apply(lambda row: Gaze(row["gaze_x_percentage"], row["gaze_y_percentage"]), axis=1)

                result = clusterer.cluster_with_given_chulls({student_id: gazes}, chull.chull_list)
                result = result[student_id]

                aoi_ids, count = np.unique(result, return_counts=True)

                for [aoi_id, c] in zip(aoi_ids, count):
                    print(f"\t#{aoi_id} AoI contains {c} gaze(s)/fixations(s).")

                fixation_count = np.zeros((n_classes,))
                if aoi_ids.shape[0] > 0:
                    fixation_count[aoi_ids] = count

                student_info[student_id] = StudentInfo(
                    fixation_count=fixation_count.tolist(),
                    confusion_reports=[],
                    inattention_count=0,
                    timestamp=0
                )

            [aoi_list] = aoi_builder(rectangles, student_info)
            all_aois.append(AoIWithTime(update_start, update_end, slide_id, aoi_list))

    return all_aois


def aoi_to_vtt(vtt_filename, aois):
    """
    Converting the AoIs into a VTT file that can be loaded along with the video.
    See `Web Video Text Tracks Format (WebVTT) <https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API>`_.
    :type vtt_filename: str
    :type aois: list[AoIWithTime]
    :param vtt_filename: The filename for storing the VTT file.
    :param aois: A list of AoIs for each slide.
    """
    vtt = WebVTT()

    for aoi in aois:
        start = millis_to_vtt_timestamp(aoi.start * 1000)
        end = millis_to_vtt_timestamp(aoi.end * 1000)

        caption = Caption(
            start,
            end,
            json.dumps({
                "slide_id": aoi.slide_id,
                "aoi_list": aoi.aoi_list
            })
        )
        vtt.captions.append(caption)

    with open(vtt_filename, 'w') as fd:
        vtt.write(fd)


def millis_to_vtt_timestamp(millis):
    """
    Converts milliseconds into VTT compatible timestamp.
    :param millis: Time in millisecond.
    :return: A string of VTT compatible timestamp
    """
    ms = str(int(millis % 1000))
    seconds = str(int((millis / 1000) % 60))
    minutes = str(int((millis / (1000 * 60)) % 60))
    hours = str(int((millis / (1000 * 60 * 60)) % 24))
    return f"{hours.zfill(2)}:{minutes.zfill(2)}:{seconds.zfill(2)}.{ms.zfill(3)}"


def read_dataframes(gaze_filenames, lecture_id):
    """
    Read in and process dataframes from the specified filenames.
    :type gaze_filenames: list[str]
    :type gaze_filenames: int
    :param gaze_filenames: A list filenames of the gaze data
    :param lecture_id: Specifies the id of lecture to consider
    :return:
    """
    dfs = {}
    for gaze_filename in gaze_filenames:
        student_id = os.path.basename(gaze_filename).split("_")[0]
        print(f"Reading gaze of student {student_id}")
        df = pd.read_csv(gaze_filename)
        # convert in second
        df["relative_timestamp"] = (df["timestamp"] - df["timestamp"][0]) / 1000

        # convert pixel into percentage
        df["gaze_x_percentage"] = df["gaze_x"] / df["client_width"]
        df["gaze_y_percentage"] = df["gaze_y"] / df["client_height"]

        # print(df["relative_timestamp"])
        dfs[student_id] = df[df.lecture_id == lecture_id]

    return dfs


if __name__ == "__main__":
    # specified the files to be read
    root_folder = "REPLACE WITH WHERE GAZE DATA IS STORED"
    student_ids = [101]

    # initialize the clusterer
    clusterer = SaliencyClusterer("square", 20)
    figsize = (540, 960)  # resize figure

    # some configurations
    lecture_id = 4
    frame_interval = 100  # in frame
    update_interval = 5  # in seconds

    video_filename = f"REPLACE_WITH_YOUR_OWN_FILE_STORAGE_PATH/assets/talk_{lecture_id}.mp4"
    vtt_filename = video_filename.replace("mp4", "vtt")

    # read in and process the gaze data of students
    # TODO: read in attention file as while to skip invalid data
    gaze_filenames = [os.path.join(root_folder, f"{student_id}_gaze_async.csv") for student_id in student_ids]
    gaze_dfs = read_dataframes(gaze_filenames, lecture_id=0)

    # generate a list of convex hulls detected from all slides
    all_chulls = video_to_chulls(video_filename, clusterer, interval=frame_interval, interactive=False)

    # assign gaze points to convex hulls detected from all slides
    all_aois = gaze_to_aois(all_chulls, clusterer, gaze_dfs, update_interval=update_interval)

    # generate the VTT file
    aoi_to_vtt(vtt_filename, all_aois)
