import datetime
import os
import copy
from .dns_helper import get_ipv4_by_hostname

GUNICORN_ENV = os.getenv("GUNICORN_ENV") or "development"

if GUNICORN_ENV == "development":
    FILEPATH = 'REPLACE_WITH_YOUR_OWN_FILE_STORAGE_PATH'
    MANAGER_HOST = "127.0.0.1"
else:
    FILEPATH = '/mnt/fileserver'
    MANAGER_HOST = get_ipv4_by_hostname("py-dedicated-server-nodeport-service.default.svc.cluster.local")[0]
    """The domain name is defined in /deployment/py-deployment-dedicated.yaml"""

CSVLOGPATH = os.path.join(FILEPATH, "ai-workshop")

MANAGER_PORT = 12580
SECRET = b"cogteach"

SERVER_PORT = 5000
DEDICATED_SERVER_PORT = 9000

N_LOGGER_THREAD = 2


def get_filename(server_type: str):
    """Generate the filename for logs.

    :param server_type: The type of server. Either "server" or "dedicated_server".
    """
    count = 0
    today = datetime.date.today()
    log_path = os.path.join(FILEPATH, 'logs', str(today))
    if not os.path.exists(log_path):
        os.makedirs(log_path)
    else:
        for filename in os.listdir(log_path):
            if server_type == "dedicated_server":
                if 'py' in filename and 'd' in filename:
                    count += 1
            else:
                if 'py' in filename and 'd' not in filename:
                    count += 1
    return os.path.join(log_path, '{}py-{}.log'.format(
        "dedicated-" if server_type == "dedicated_server" else "", count)
                        )


class InternalFilter():
    """Used by logger.

    See https://docs.python.org/3/howto/logging-cookbook.html#using-filters-to-impart-contextual-information
    """
    def filter(self, record):
        if 'dedicated' in record.module:
            record.module = 'Dedicated'
        return 0 if 'internal' in record.module else 1


DEDICATED_APP_LOGGER_CONFIG = {
    'version': 1,
    'formatters': {'default': {
        'format': '[%(asctime)s] [%(module)s] [%(levelname)s] %(message)s',
        'datefmt': '%Y-%m-%d %H:%M:%S'
    }},
    'filters': {'no-internal': {
        '()': InternalFilter  # Specify filter class with key '()'
    }},
    'handlers': {'wsgi': {
        'class': 'logging.StreamHandler',
        # 'stream': 'ext://flask.logging.wsgi_errors_stream',
        'stream': 'ext://sys.stdout',
        'formatter': 'default',
        'filters': ['no-internal']
    }, 'file': {
        'class': 'logging.FileHandler',
        'filename': get_filename("dedicated_server"),
        'formatter': 'default',
        'filters': ['no-internal']
    }},
    'root': {
        'level': 'INFO',
        'handlers': ['wsgi', 'file']
    }
}

APP_LOGGER_CONFIG = copy.deepcopy(DEDICATED_APP_LOGGER_CONFIG)
APP_LOGGER_CONFIG["handlers"]["file"]["filename"] = get_filename("server")

"""
Pre-set experiment settings for async lectures (recorded videos).
"""
CONTROL_ASYNC = {
    "shareGazeInfo": True,
    "shareCogInfo": True,
    "gazeEstimatorName": "webgazer",
    "facialExpCollectorName": "pure-quicksend",
    "visualizerNames": "action-asbanner",
    "confusionReporterName": "screen",
    "aoiSource": "none",
}
TREATMENT_ALWAYS_ON = {
    "shareGazeInfo": True,
    "shareCogInfo": True,
    "gazeEstimatorName": "webgazer",
    "facialExpCollectorName": "pure-quicksend",
    "visualizerNames": ["aoi-monochrome", "action-asbanner"],
    "confusionReporterName": "screen",
    "aoiSource": "peer",
}
TREATMENT_ON_CHANGE = {
    "shareGazeInfo": True,
    "shareCogInfo": True,
    "gazeEstimatorName": "webgazer",
    "facialExpCollectorName": "pure-quicksend",
    "visualizerNames": ["aoi-onchange-monochrome", "action-asbanner"],
    "confusionReporterName": "screen",
    "aoiSource": "peer",
}
TREATMENT_EXPERT = {
    "shareGazeInfo": True,
    "shareCogInfo": True,
    "gazeEstimatorName": "webgazer",
    "facialExpCollectorName": "pure-quicksend",
    "visualizerNames": ["aoi", "action-asbanner"],
    "confusionReporterName": "screen",
    "aoiSource": "expert",
}


def group_id_to_setting(group_id):
    """
    Convert the group id into experiment setting.
    :param group_id: The exp group id.
    :return: A dictionary of experiment setting.
    """
    group_id = int(group_id)
    if group_id == 0:
        setting = CONTROL_ASYNC
    elif group_id == 1:
        setting = TREATMENT_ALWAYS_ON
    elif group_id == 2:
        setting = TREATMENT_ON_CHANGE
    else:
        setting = TREATMENT_EXPERT
    return setting


GROUP_THRESHOLDING = 40
