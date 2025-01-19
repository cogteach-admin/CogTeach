import json
from logging.config import dictConfig
import time
import os
from multiprocessing import Queue

import flask
import numpy as np
from flask import Flask, request

from skimage import io as skio

from gaze.clusterer import SaliencyClusterer
from gaze.engbert_kliegl import EKPartialDetector
from gaze.gaze_classes import aoi_builder, StudentInfo
from shared_info_manager import config_client
# for unit testing
from utilities.dataformat import MockLock, MockValue, Record, RecordType
from utilities.global_settings import MANAGER_HOST, MANAGER_PORT, SECRET, SERVER_PORT, APP_LOGGER_CONFIG, FILEPATH
from utilities.server_util import b64_to_image, remove_black_margin, calculate_padding, save_screenshot, \
    save_facial_expression

"""EK detector"""
detector = EKPartialDetector()

"""Clusterer"""
clusterer = SaliencyClusterer("square", 20)
figsize = (540, 960)  # resize figure
local_chulls = []  # global var to reduce the connection to manager
local_slide_id = 0  # to check if chulls are updated.
local_slide_aspect_ratio = 0  # used for client side viz
"""Shared state managed by multiprocessing module."""
manager = config_client(MANAGER_HOST, MANAGER_PORT, SECRET)
shared_lock = MockLock()
"""Clustering related-information"""
shared_slide_id = MockValue(0)
shared_slide_aspect_ratio = MockValue(0)
shared_chulls = []
"""Global status. All dicts with key: stuNum"""
shared_student_info = {}
shared_queue = Queue()
"""Set up logger."""
dictConfig(APP_LOGGER_CONFIG)
app = Flask(__name__)


@app.route('/', methods=['GET'])
def index():
    """ The home page has a list of prior translations and a form to
        ask for a new translation.
    """
    return '<h1> Server (python) is on. </h1>'


"""Uncomment when testing locally. This enables CORS."""
# @app.route("/service/saliency", methods=['OPTIONS'])
# @app.route("/service/cluster", methods=['OPTIONS'])
# @app.route("/service/visual_cue", methods=['OPTIONS'])
# @app.route("/service/workshop", methods=['OPTIONS'])
# @app.route("/service/image", methods=['OPTIONS'])
# def enable_cors():
#     r = flask.make_response({"message": "ok"})
#     r.headers['Access-Control-Allow-Origin'] = '*'
#     r.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
#     r.headers["Access-Control-Allow-Headers"] = "x-api-key,Content-Type"
#     r.headers['Content-Type'] = 'application/json'
#     return r


@app.route('/service/saliency', methods=['POST'])
def update_saliency_map():
    """Handles the request form teacher to update the slide.

    Structure of the request body should meet:
    - `slide_id`: The sequential number of slide screenshot.
    - `screenshot`: The screenshot itself. Encoded in base64.
    - `padding` : Information on how to pad screenshots. Including:
        top: margin for the iframe element;
        availableWidth/availableHeight: Width/height of the iframe
    - `timestamp`: The timestamp when the request is made.
    - `role`: STUDENT (1) or TEACHER (2). Represented by Role enum class.
    """
    global local_slide_id, local_chulls, local_slide_aspect_ratio, shared_slide_id, shared_chulls, shared_slide_aspect_ratio
    data = request.data  # .decode('utf-8')
    body = json.loads(data)

    res = "Screenshot is the same. No update is being made."

    slide_id = int(body["slide_id"])
    padding = body["padding"]
    with shared_lock:
        if shared_slide_id.value != slide_id:
            # The shared_slide_id is initialized to be 0. Thus, the slide_id starts with 1.
            # The shared information is not initialized, or need to be updated
            screenshot = b64_to_image(body["screenshot"])
            # remove black borders
            screenshot = remove_black_margin(screenshot)

            # Padding with 1 than using 0
            # white = screenshot.max()
            # screenshot = np.pad(screenshot, calculate_padding(screenshot.shape, padding), mode='constant',
            #                     constant_values=white)

            local_slide_id = slide_id
            local_slide_aspect_ratio = screenshot.shape[1] / screenshot.shape[0]  # [H, W, C]
            local_chulls = clusterer.get_salient_regions_hierarchy(screenshot)

            shared_slide_id.value = slide_id
            # add aspect ratio information for client side viz
            shared_slide_aspect_ratio.value = local_slide_aspect_ratio
            shared_chulls[:] = local_chulls
            res = "Screenshot updated."
        else:
            # The slide is not changed.
            pass

    if "updated" in res:
        # write intermediate images for analysis
        save_screenshot(screenshot, FILEPATH, slide_id)
        app.logger.info("Screenshot updated. Current version: {}".format(local_slide_id))

    r = flask.make_response({"message": res})
    r.headers['Access-Control-Allow-Origin'] = '*'
    r.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    r.headers["Access-Control-Allow-Headers"] = "x-api-key,Content-Type"
    r.headers['Content-Type'] = 'application/json'
    return r


@app.route('/service/cluster', methods=['POST'])
def cluster():
    """Cluster the gaze data posted by students.

    Structure of the request body should meet:
    - `stuNum`: The student number.
    - `gaze_samples`: The gaze points. A dictionary containing fields: x, y, timestamp.
        Note that the x/y are normalized to 0-1 w.r.t. each user's screen shape.
    - `raw_samples`: The raw gaze points without being normalized. A dictionary containing
        fields: x, y, timestamp, clientWidth, clientHeight
    - `thresholds`: The velocity thresholds. A tuple (threshold_x, threshold_y)
    - `confusion`: A list of dictionaries with fields:
        1. `timestamp`: The timestamp when the confusion is reported.
        2. `slide_id`: The id of the slide when confusion is reported.
        3. `aoi_id`: The id of the AoI when confusion is reported.
    - `inattention`: The number of detected inattention.
    - `mouse_events`: A list of mouse events. Including clicks, and movement.
        [timestamp, mouse_x, mouse_y, event, slide_id, aoi_id]
    - `timestamp`: The timestamp when the request is made.
    - `role`: STUDENT (1) or TEACHER (2). Represented by Role enum class.

    Structure of the response body should meet:
    - `stuNum`: The student number.
    - `slide_id`: The Id of current slide.
    - `aois`: A list of AoIs. Each AoI is an instance of the AoI class defined in gaze/gaze_classes.py.
    - `confusion_ratio`: The ratio of # confusion students / # students.
    - `inattention_ratio`:The ratio of # inattentive students / # students.
    """
    global local_slide_id, local_chulls, local_slide_aspect_ratio, shared_student_info

    # parse request from the students
    data = request.data  # .decode('utf-8')
    body = json.loads(data)

    student_number = body["stuNum"]
    group_id = body["groupId"]
    lecture_id = body["lectureId"]

    confusion_info = body["confusion"]
    mouse_events = body["mouse_events"]
    inattention_count = int(body["inattention"])

    app.logger.info("Received post from student number {}".format(student_number))

    # detect fixations
    fixations, saccades = detector.detect_threshold(
        body["gaze_samples"], body["thresholds"], smooth_saccades=True
    )

    # align fixations with AoIs
    with shared_lock:
        if local_slide_id != shared_slide_id.value:
            """Need to update the local version of chulls, and slide aspect ratio."""
            local_slide_id = shared_slide_id.value
            local_chulls = shared_chulls[:]
            local_slide_aspect_ratio = shared_slide_aspect_ratio.value
    n_classes = len(local_chulls)
    result = clusterer.cluster_with_given_chulls({student_number: fixations}, local_chulls)
    result = result[student_number]

    # update the student's information with the global information manager
    with shared_lock:
        """Write student specific information to the shared info manager
        Information need to be shared globally:
        1. Number of fixations
        2. The AoI with confusion associated, if reported
        3. Inattention, if detected
        """
        aoi_ids, count = np.unique(result, return_counts=True)
        fixation_count = np.zeros((n_classes,))
        if aoi_ids.shape[0] > 0:
            fixation_count[aoi_ids] = count

        confusion_reports = []
        for c in confusion_info:
            confusion_reports.append((c["slide_id"], c["aoi_id"]))
        shared_student_info[student_number] = StudentInfo(
            fixation_count=fixation_count.tolist(),
            confusion_reports=confusion_reports,
            inattention_count=inattention_count,
            timestamp=time.time()
        )

        local_student_info = shared_student_info.copy()

    # Put record in queue for the logger to materialize
    shared_queue.put(Record(type=RecordType.GAZE, stu_num=student_number, body={
        "gaze": body["raw_samples"],
        "fixations": fixations,
        "slide_id": local_slide_id,
        "lecture_id": lecture_id,
        "group_id": group_id,
        "aoi_ids": result
    }))
    if len(confusion_info) > 0:
        shared_queue.put(Record(type=RecordType.CONFUSION, stu_num=student_number, body={
            "confusion": confusion_info,
            "lecture_id": lecture_id,
            "group_id": group_id,
        }))
    if len(mouse_events) > 0:
        shared_queue.put(Record(type=RecordType.CLICK, stu_num=student_number, body={
            "mouse_events": mouse_events,
            "lecture_id": lecture_id,
            "group_id": group_id,
        }))

    # construct response
    aois, confusion_ratio, inattention_ratio = aoi_builder(clusterer.rects_, local_student_info,
                                                           return_confusion_ratio=True,
                                                           return_inattention_ratio=True)
    res = flask.make_response({
        'stuNum': student_number,
        "slide_id": local_slide_id,
        'aois': aois,
        "slide_aspect_ratio": local_slide_aspect_ratio,
        'confusion_ratio': confusion_ratio,
        'inattention_ratio': inattention_ratio
    })
    res.headers['Access-Control-Allow-Origin'] = '*'
    res.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    res.headers["Access-Control-Allow-Headers"] = "x-api-key,Content-Type"
    res.headers['Content-Type'] = 'application/json'

    return res


@app.route('/service/workshop', methods=['POST'])
def record():
    """Handles the information posted from each student participant.
    """
    # parse request from the students
    data = request.data  # .decode('utf-8')
    body = json.loads(data)

    student_number = body["stuNum"]
    group_id = body["groupId"]
    lecture_id = body["lectureId"]

    update_counter = body["updateCounter"]

    facial_expression = body["facialExpression"]
    confusion_info = body["confusion"]
    mouse_events = body["mouse_events"]
    inattention_info = body["inattention"]

    app.logger.info(f"Received post #{update_counter} from student number {student_number}")

    # Put a gaze record in queue for the logger to materialize
    shared_queue.put(Record(type=RecordType.GAZE_ASYNC, stu_num=student_number, body={
        "gaze": body["raw_samples"],
        "lecture_id": lecture_id,
        "group_id": group_id,
    }))

    # Put an attention record in queue for the logger to materialize
    if len(inattention_info) > 0:
        shared_queue.put(Record(type=RecordType.INATTENTION, stu_num=student_number, body={
            "inattention": inattention_info,
            "lecture_id": lecture_id,
            "group_id": group_id,
        }))

    # Put a confusion record in queue for the logger to materialize
    if len(confusion_info) > 0:
        shared_queue.put(Record(type=RecordType.CONFUSION_ASYNC, stu_num=student_number, body={
            "confusion": confusion_info,
            "lecture_id": lecture_id,
            "group_id": group_id,
        }))

    # Put a mouse movement record in queue for the logger to materialize
    if len(mouse_events) > 0:
        shared_queue.put(Record(type=RecordType.CLICK_ASYNC, stu_num=student_number, body={
            "mouse_events": mouse_events,
            "lecture_id": lecture_id,
            "group_id": group_id,
        }))

    # save facial expressions collected
    if len(facial_expression) > 0:
        for r in facial_expression:
            # record = [timestamp, b64string]
            dirname = os.path.join(FILEPATH, "ai-workshop", str(student_number))
            filename = f"{r[0]}_talk_{lecture_id}"
            save_facial_expression(r[1], dirname, filename)

    res = flask.make_response({
        'message': "Posted information received"
    })
    res.headers['Access-Control-Allow-Origin'] = '*'
    res.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    res.headers["Access-Control-Allow-Headers"] = "x-api-key,Content-Type"
    res.headers['Content-Type'] = 'application/json'

    return res


@app.route('/service/image', methods=['POST'])
def record_image():
    # save facial expressions collected
    data = request.data  # .decode('utf-8')
    body = json.loads(data)

    student_number = body["stuNum"]
    lecture_id = body["lectureId"]

    facial_expression = body["facialExpression"]
    for r in facial_expression:
        # record = [timestamp, b64string]
        # print(f"Writting image {r[0]}")
        dirname = os.path.join(FILEPATH, "ai-workshop", str(student_number))
        filename = f"{r[0]}_talk_{lecture_id}"
        save_facial_expression(r[1], dirname, filename)

    res = flask.make_response({
        'message': "Face screenshot received"
    })
    res.headers['Access-Control-Allow-Origin'] = '*'
    res.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    res.headers["Access-Control-Allow-Headers"] = "x-api-key,Content-Type"
    res.headers['Content-Type'] = 'application/json'

    return res


@app.route('/service/visual_cue', methods=['POST'])
def get_visual_cue():
    """Provide visual cues back to the students.

    DEPRECATED: This is not used. Visual cues are generated using VTT files.
    """
    data = request.data  # .decode('utf-8')
    body = json.loads(data)
    aoi_source = body["aoiSource"]
    timestamp = body["timestamp"]

    pass


def connect_to_shared_info_manager():
    """Connect to the shared info manager.

    See https://docs.python.org/3/library/multiprocessing.html#managers for more information.
    """
    global shared_lock, shared_slide_id, shared_slide_aspect_ratio, shared_chulls, shared_student_info, shared_queue
    manager.connect()
    shared_lock = manager.get_lock()
    """Clustering related-information"""
    shared_slide_id = manager.get_slide_id()
    shared_slide_aspect_ratio = manager.get_slide_aspect_ratio()
    shared_chulls = manager.get_chulls()
    """Global status. All dicts with key: stuNum"""
    shared_student_info = manager.get_student_info()
    shared_queue = manager.get_queue()

    app.logger.info("Shared info manager is connected.")


def main():
    connect_to_shared_info_manager()
    app.run(host='0.0.0.0', port=SERVER_PORT, debug=False, threaded=False)


if __name__ == "__main__":
    """Running directly through python server.py. This happens in production."""
    app.logger.info("Server running as {}.".format(__name__))
    try:
        main()
    except (ConnectionError,) as err:
        app.logger.error("Can not connect to the shared info manager. {}".format(
            err
        ))
else:
    # run inside the gunicorn
    connect_to_shared_info_manager()

    # updates on Nov 15, 2022
    # By changing the worker type from gevent to sync, we can connect to the shared info mangager.

    # """It seems we are unable to make socket connection within gunicorn.
    # So we will run the server directly, rather than wrapping it behind gunicorn.
    # This part is originally running when GUNICORN_ENV = production"""
    # # use same log handlers as in gunicorn logger
    # # connecting the gunicorn logger with flask app
    # gunicorn_logger = logging.getLogger('gunicorn.error')
    # app.logger.handlers = gunicorn_logger.handlers
    # app.logger.setLevel(gunicorn_logger.level)
    # app.logger.info("MANAGER ADDR: {}:{}, SECRET: {}".format(
    #     MANAGER_HOST, MANAGER_PORT, SECRET
    # ))
    # # connecting to the shared info server
    # try:
    #     connect_to_shared_info_manager()
    # except (ConnectionError, BlockingIOError) as err:
    #     app.logger.error("Can not connect to the shared info manager. {}".format(
    #         err
    #     ))
