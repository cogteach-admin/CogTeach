import json
import os
import queue
import signal
import threading
import time
from datetime import timedelta
from logging.config import dictConfig
from multiprocessing import Queue
from threading import Thread
from time import ctime

import flask
from flask import Flask, request
from timeloop import Timeloop
import pandas as pd

from shared_info_manager import config_client
from utilities.csv_logger import CSVLogger
from utilities.dataformat import MockLock, TestInfo
from utilities.global_settings import FILEPATH, CSVLOGPATH, DEDICATED_APP_LOGGER_CONFIG, \
    MANAGER_HOST, MANAGER_PORT, SECRET, DEDICATED_SERVER_PORT, \
    GROUP_THRESHOLDING, \
    group_id_to_setting

update_interval = timedelta(seconds=5)
dictConfig(DEDICATED_APP_LOGGER_CONFIG)

tl = Timeloop()
app = Flask(__name__)
csv_logger = CSVLogger(CSVLOGPATH, app.logger)

manager = config_client(MANAGER_HOST, MANAGER_PORT, SECRET)
shared_lock = MockLock()
shared_student_info = {}
shared_queue = Queue()

file_objects = {}  # holds the actual file objects for each student
writers = {}  # holds the csv.writer objects for each student

user_profile = None
talk_info_list = []


@app.route("/", methods=["GET"])
def index():
    return "<h1>The dedicated server for Remove Obsolete Info and Materialization is on.</h1>"


"""Uncomment when testing locally. This enables CORS."""
# @app.route("/workshop/update", methods=['OPTIONS'])
# @app.route("/workshop/progress", methods=['OPTIONS'])
# @app.route("/workshop/view_numbers", methods=['OPTIONS'])
# @app.route("/internal/update", methods=['OPTIONS'])
# def enable_cors():
#     r = flask.make_response({"message": "ok"})
#     r.headers['Access-Control-Allow-Origin'] = '*'
#     r.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
#     r.headers["Access-Control-Allow-Headers"] = "x-api-key,Content-Type"
#     r.headers['Content-Type'] = 'application/json'
#     return r


@app.route("/internal/testing/set_entry", methods=["GET"])
def add_entry():
    """Used for testing to see if we can add new record to shared info manager."""
    cur_time = time.time()
    shared_student_info["testing"] = TestInfo(timestamp=cur_time)
    return str(cur_time)


@app.route("/internal/testing/get_entry", methods=["GET"])
def get_entry():
    """Used for testing to see if we can get new record to shared info manager."""
    if "testing" in shared_student_info:
        return str(shared_student_info["testing"])
    else:
        return "Obs data deleted."


@app.route("/internal/testing/csv_logger", methods=["GET"])
def get_csv_logger_status():
    """Used for testing to retrieve the current status of the CSV logger status."""
    res = flask.Response()
    res.set_data(json.dumps(csv_logger.get_status_summary()))
    res.headers['Access-Control-Allow-Origin'] = '*'
    res.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    res.headers["Access-Control-Allow-Headers"] = "x-api-key,Content-Type"
    res.headers['Content-Type'] = 'application/json'
    return res


@app.route("/internal/update", methods=["POST"])
def update_talk_history():
    """Used by the administrator to interact with the information in server."""
    global user_profile, talk_info_list
    data = json.loads(request.data)

    action = data["action"]

    data_reply = ""
    try:
        if action == "flush":
            # just to flush changes
            message = "Saving the dataframes manually."
            flush_talk_management_df()
        elif action == "change":
            student_id = int(data["student_id"])
            talk_id = int(data["talk_id"])
            new_value = data["new_value"] == "True"

            old_value = user_profile.loc[user_profile["student_id"] == student_id, f"talk_{talk_id}"].bool()

            if old_value == new_value:
                message = f"Modifying request ignored: stu. {student_id} talk {talk_id} changing from {old_value} to {new_value}"
                data_reply = user_profile.loc[user_profile["student_id"] == student_id]
                data_reply = data_reply.to_csv()
            else:
                message = f"Modifying the files directly: stu. {student_id} talk {talk_id} changing from {old_value} to {new_value}"
                # updating the user_profile
                user_profile.loc[user_profile["student_id"] == student_id, f"talk_{talk_id}"] = new_value
                data_reply = user_profile.loc[user_profile["student_id"] == student_id]
                # updating the talk_info_list[talk_id]
                talk_df = talk_info_list[talk_id]
                if new_value:
                    # changing "not watched" to "watched"
                    pass
                else:
                    # changing "watched" to "not watched"
                    talk_df.drop(talk_df[talk_df["student_id"] == student_id].index, inplace=True)
                # confirm the changes
                flush_talk_management_df()
                data_reply = data_reply.to_csv()
        elif action == "reload":
            # to reload the information from disks
            information_name = data["information_name"]
            message = f"Reloading {information_name}. "
            if information_name == "user_profile":
                # return talk history as json
                disk_df = pd.read_csv(os.path.join(FILEPATH, "registeredInfo", "user_profile.csv"))
                if len(disk_df) > len(user_profile):
                    # adding new users
                    if not user_profile.equals(disk_df[:len(user_profile)]):
                        # more changes than just adding new users have happened
                        message += "More changes than just adding new users have happened."
                        data_reply = user_profile.compare(disk_df[:len(user_profile)]).to_csv()
                    else:
                        # add new users
                        message += "Adding new users."
                        user_profile = pd.concat([user_profile, disk_df[len(user_profile):]], ignore_index=True)
                        data_reply = user_profile.to_csv()
                else:
                    message += "#lines of the disk file is smaller or equal to the file in memory. Reload blocked."
            elif information_name == "talk":
                message += "Reloading specific talk history is not enabled."
        elif action == "fetch":
            # to fetch the stored information and visualize
            information_name = data["information_name"]
            message = f"Fetching {information_name}."
            if information_name == "user_profile":
                # return talk history as json
                data_reply = user_profile.to_csv()
            elif information_name == "talk":
                talk_id = int(data["talk_id"])
                # return just one talk
                data_reply = talk_info_list[talk_id].to_csv()
        elif action == "create":
            # to create a new user profile.
            need_to_create = True

            if data["first_name"] in user_profile["first_name"] \
                    and data["last_name"] in user_profile["last_name"] \
                    and data["student_id"] in user_profile["student_id"] :
                need_to_create = False

            if need_to_create:
                new_user_profile = pd.DataFrame({
                    "first_name": data["first_name"],
                    "last_name": data["last_name"],
                    "current_education_level": "",
                    "age": -1,
                    "student_id": data["student_id"],
                    "talk_0": False,
                    "talk_1": False,
                    "talk_2": False,
                    "talk_3": False,
                    "talk_4": False,
                    "confirmed": False,
                    "sub_ques_1": False,
                    "sub_ques_2": False
                }, index=[0])
                user_profile = pd.concat([user_profile, new_user_profile], ignore_index=True)
                # confirm the changes
                flush_talk_management_df()
            # construct return message
            if need_to_create:
                message = f"User created. ID: {user_profile.shape[0] - 1}"
            else:
                message = f"Duplicated requests for user creation. " \
                          f"Name: {data['first_name']} {data['last_name']}, ID: {data['student_id']}"
    except Exception as e:
        message = f"{type(e).__name__} : {e.message}"

    app.logger.info(message)

    res = flask.Response()
    res.set_data(json.dumps({
        "message": message,
        "data": data_reply
    }))
    res.headers['Access-Control-Allow-Origin'] = '*'
    res.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    res.headers["Access-Control-Allow-Headers"] = "x-api-key,Content-Type"
    res.headers['Content-Type'] = 'application/json'
    return res


@app.route("/workshop/progress", methods=["POST"])
def get_progress():
    """To fetch the information on the progress of a specific student."""
    data = json.loads(request.data)

    user_info = data['userInfo']
    # converted into int automatically
    student_id = user_info["number"]
    first_name = user_info["firstName"]
    last_name = user_info["lastName"]

    checkpoint = data["checkpoint"]

    if checkpoint == "all_progress":
        # used in workshop video selection page.
        # returns a list of boolean values indicating if the user has watched the talk
        res = flask.make_response(
            json.loads(user_profile[user_profile["student_id"] == student_id].to_json(orient="records"))[0])
    elif checkpoint == "confirm":
        # used in workshop video selection page.
        # user self-report completing all form(s)
        document = data["document"]
        if document == "doc":
            user_profile.loc[user_profile["student_id"] == student_id, "confirmed"] = True
            res = flask.make_response("done")
            app.logger.info(f"Stu. #{student_id} {first_name} {last_name} self-reported eSignatures.")
        elif "questionnaire" in document:
            questionnaire_count = int(document.split("-")[1])
            user_profile.loc[user_profile["student_id"] == student_id, f"sub_ques_{questionnaire_count}"] = True
            res = flask.make_response("done")
            app.logger.info(
                f"Stu. #{student_id} {first_name} {last_name} self-reported questionnaire {questionnaire_count}."
            )
    else:
        # used in watching the recorded video
        # important checkpoints during the experiment
        talk_id = int(data["talkId"])
        timestamp = data["timestamp"]

        message = "checkpoint {} at {} recorded.".format(checkpoint, timestamp)

        # if the user has already finished watching the video, review is set to be true
        # this is done by checking the talk history dataframe.
        review = user_profile.loc[user_profile["student_id"] == student_id, "talk_{}".format(talk_id)].values
        if review:
            # TODO: 2) when reviewing the contents (multiple rows will be added)
            talk_df = talk_info_list[talk_id]
            review_order = \
            talk_df.loc[talk_df["student_id"].str.startswith(str(student_id)), "end_time"].dropna().shape[0]
            # use modified student id to create multiple rows recording the view history
            student_id = f"{student_id}_{review_order}"
            # overwrite respond if user is reviewing
            message = "[REVIEWING #{}]. checkpoint {} at {} recorded.".format(review_order, checkpoint, timestamp)

        if checkpoint == "start_time":
            # the user starts the talk.
            # TODO: 1) refresh in the middle
            talk_df = talk_info_list[talk_id]
            if (talk_df["student_id"] == student_id).any():
                # the student has watched the page
                # this is due to refreshing the page during the lecture
                talk_df.loc[talk_df["student_id"] == student_id, checkpoint] = timestamp
            else:
                # this is the first time watching the lecture
                # need initialization
                talk_df.loc[len(talk_df)] = {
                    "student_id": student_id,
                    "first_name": first_name,
                    "last_name": last_name,
                    "start_time": timestamp
                }
        else:
            talk_df = talk_info_list[talk_id]
            talk_df.loc[talk_df["student_id"] == student_id, checkpoint] = timestamp

            if checkpoint == "end_time" and not review:
                # one talk is completed, set the watched history to true for this lecture
                user_profile.loc[user_profile["student_id"] == student_id, "talk_{}".format(talk_id)] = True

        res = flask.make_response({"message": message})

    res.headers['Access-Control-Allow-Origin'] = '*'
    res.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    res.headers["Access-Control-Allow-Headers"] = "x-api-key,Content-Type"
    res.headers['Content-Type'] = 'application/json'
    return res


@app.route("/workshop/view_numbers", methods=["POST"])
def get_talk_view_numbers():
    """To fetch the information of how many times the student have watched a lecture and the corresponding setting."""
    data = json.loads(request.data)

    talk_id = int(data["talkId"])
    user_info = data['userInfo']
    student_id = user_info["number"]
    group_id = user_info["group"]

    # TODO: check if the user is watching the video for the first time or reviewing
    single_user_profile = user_profile.loc[user_profile["student_id"] == student_id]
    # if the user has already finished watching the video, review is set to be true
    # this is done by checking the talk history dataframe.
    review = single_user_profile["talk_{}".format(talk_id)].values

    # examine whether the user is allowed to visit this page.
    # 1) visiting a formal talk when intro is not finished
    is_intro_finished = single_user_profile["talk_0"].values
    # 2) reviewing a page without completing all lectures. can be done by go back to previous page
    talk_columns = list(filter(lambda col: col.startswith("talk"), user_profile.columns.tolist()))
    is_all_finished = single_user_profile[talk_columns].all(axis=1)

    if review and talk_id > 0 and not is_all_finished:
        refuse = "You are reviewing a lecture without finishing all lectures."
        app.logger.warning(f"Student {student_id} is blocked due to {refuse}")
    elif talk_id > 0 and not is_intro_finished:
        refuse = "You are attending a talk without finishing the introduction video."
        app.logger.warning(f"Student {student_id} is blocked due to {refuse}")
    else:
        refuse = ""

    # TODO: decide the setting based current education level
    if talk_id == 0:
        # for intro session, no feedback will be shown
        setting = group_id_to_setting(0)  # control group CONTROL_ASYNC
    else:
        # deciding the expriment setting based on the order
        # view_numbers = user_profile["talk_{}".format(talk_id)].sum()
        # # for formal talks
        # if view_numbers <= GROUP_THRESHOLDING:
        #     setting = CONTROL_ASYNC
        # elif view_numbers <= 2 * GROUP_THRESHOLDING:
        #     setting = TREATMENT_ALWAYS_ON
        # elif view_numbers <= 3 * GROUP_THRESHOLDING:
        #     setting = TREATMENT_ON_CHANGE
        # else:
        #     setting = TREATMENT_EXPERT
        setting = group_id_to_setting(group_id)

    res = flask.make_response({
        "setting": setting,
        "refuse": refuse
    })
    res.headers['Access-Control-Allow-Origin'] = '*'
    res.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    res.headers["Access-Control-Allow-Headers"] = "x-api-key,Content-Type"
    res.headers['Content-Type'] = 'application/json'
    return res


@tl.job(interval=timedelta(seconds=2))
def remove_obs_entries():
    """Routinely remove the obsolete entries."""
    # with an interval 2, the expected time of update is 5s.
    # min d + floor(u / t + 1) * t, s.t. T in (0. U], d follows U(0, T)
    # print('here!', time.time())

    # app.logger.info("Removing obs entries: ")
    current_time = time.time()
    with shared_lock:
        for stu_num, info in shared_student_info.items():
            # app.logger.info("{} : {}".format(stu_num, info))
            if current_time - info.timestamp > update_interval.seconds:
                # app.logger.info("Deleted.")
                del shared_student_info[stu_num]
            else:
                # app.logger.info("Kept.")
                pass


@tl.job(interval=timedelta(seconds=timedelta(minutes=30).seconds))
def flush_log():
    """Routinely flush logs to the disk."""
    # The csv_logger needs flush to materialize logs
    csv_logger.flush()
    app.logger.info("All files are flushed.")


@tl.job(interval=timedelta(seconds=timedelta(minutes=30).seconds))
def flush_talk_management_df():
    """Routinely flush logistics files to the disk."""
    user_profile.to_csv(os.path.join(FILEPATH, "registeredInfo", "user_profile.csv"), index=False)

    for (talk_id, talk_df) in enumerate(talk_info_list):
        talk_df.to_csv(os.path.join(FILEPATH, "registeredInfo", "talk_{}.csv".format(talk_id)), index=False)

    app.logger.info("All dataframes are stored.")


def logging(stop_event, gunicorn_logger):
    """todo: possibly threading. csv_logger is not thread safe."""
    try:
        while not stop_event.is_set():
            try:
                record = shared_queue.get(block=True, timeout=2 * update_interval.seconds)
                # gunicorn_logger.info("csv_logger: {} for {}".format(record.type, record.stu_num))
                csv_logger.log(record.type, record.stu_num, record.body)
            except (queue.Empty,):
                """otherwise, the queue.get() will block."""
                pass
    finally:
        gunicorn_logger.info("csv_logger: stop_event.is_set() = {}. Ending now...".format(stop_event.is_set()))
        # csv_logger.terminate()


stop_event = threading.Event()
csv_logger_thread = Thread(target=logging, args=(stop_event, app.logger), daemon=True)


@app.route("/internal/testing/shutdown", methods=["GET"])
def exit_handler(*args):
    """Manages the termination of the dedicated server.

    Responsible for:
    1) Close log files.
    2）Write all data frames.
    3) Terminate timeloop.
    4) Log the signal which causes the server to terminate. (SIGKILL is not catchable.)
    """
    # close log files
    app.logger.info("Terminating the csv_logger")
    stop_event.set()
    csv_logger.terminate()
    # store all dfs
    app.logger.info("Flushing the dataframes")
    flush_talk_management_df()
    # terminate timeloop
    app.logger.info("Terminating the timeloop")
    tl.stop()
    app.logger.info("End of clean-up")

    return "Dedicated server exit cleaning-up is done."


def connect_to_shared_info_manager():
    """Connect to the shared info manager.

    See https://docs.python.org/3/library/multiprocessing.html#managers for more information.
    """
    global shared_lock, shared_student_info, shared_queue

    manager.connect()
    shared_lock = manager.get_lock()
    """Global status. Key: stuNum. Value: StudentInfo"""
    shared_student_info = manager.get_student_info()
    shared_queue = manager.get_queue()

    app.logger.info("Shared info manager is connected.")


def main():
    global user_profile, talk_info_list
    connect_to_shared_info_manager()
    """Read AI workshop related management csv files"""
    user_profile = pd.read_csv(os.path.join(FILEPATH, "registeredInfo", "user_profile.csv"))
    # column student_id converted into int automatically
    # print(user_profile["student_id"])

    for talk_id in range(4 + 1):
        talk_info_list.append(
            pd.read_csv(os.path.join(FILEPATH, "registeredInfo", "talk_{}.csv".format(talk_id)),
                        dtype={"student_id": str})
        )
    """Start services"""
    csv_logger_thread.start()
    app.logger.info("CSV Logger started.")
    tl.start()
    app.logger.info("Timeloop started.")
    app.run(host='0.0.0.0', port=DEDICATED_SERVER_PORT, debug=False, threaded=True)


if __name__ == "__main__":
    app.logger.info("Dedicated server running as {}.".format(__name__))
    # signal.signal(signal.SIGTERM, exit_handler)
    # signal.signal(signal.SIGINT, exit_handler)
    try:
        main()
    except (ConnectionError,) as err:
        app.logger.error("Can not connect to the shared info manager. {}".format(
            err
        ))
    finally:
        exit_handler()
