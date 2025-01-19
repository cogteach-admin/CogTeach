import multiprocessing
from datetime import date
import os
import logging

from utilities.global_settings import FILEPATH, SERVER_PORT

# This file is for running the py-servers. dedicated server runs directly.

bind = '0.0.0.0:{}'.format(SERVER_PORT)
workers = multiprocessing.cpu_count()
# workers = 2
print('{} workers start!'.format(workers))
# See http://docs.gunicorn.org/en/stable/settings.html#worker-class
# This seems to be reason why we can not connect to the shared_info_manager inside gunicorn.
# The default 'sync' workers seem to be fine, but with a potential risk of being blocked.
# The 'gthread' workers seem to be fine as well.
worker_class = 'gthread'


# worker_tmp_dir = '/dev/shm'  # See https://github.com/benoitc/gunicorn/pull/1873/files

def get_file_handler():
    """Return the handler to be added.

    See https://docs.python.org/3/library/logging.html#logging.Logger.addHandler.
    """
    count = 0
    today = date.today()
    logpath = os.path.join(FILEPATH, 'logs', str(today))
    if not os.path.exists(logpath):
        os.makedirs(logpath)
    else:
        for filename in os.listdir(logpath):
            if 'py' in filename and 'd' not in filename:
                count += 1

    fh = logging.FileHandler(os.path.join(logpath, 'py-{}.log'.format(count)))
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter('[%(asctime)s] [%(levelname)s] PID %(process)d: %(message)s',
                                      '%Y-%m-%d %H:%M:%S'))

    return fh


logging.getLogger('gunicorn.error').addHandler(get_file_handler())
