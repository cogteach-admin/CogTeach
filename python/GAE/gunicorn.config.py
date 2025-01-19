import multiprocessing
from datetime import date
import os
import logging

bind = '0.0.0.0:8000'
# workers = multiprocessing.cpu_count() * 3 + 1
workers = 2
print('{} workers start!'.format(workers))
# See http://docs.gunicorn.org/en/stable/settings.html#worker-class
worker_class = 'gevent'
# worker_tmp_dir = '/dev/shm'  # See https://github.com/benoitc/gunicorn/pull/1873/files

FILEPATH = '/mnt/fileserver'
def getFileHandler():
    count = 0
    today = date.today()
    logpath = os.path.join(FILEPATH, 'logs', str(today))
    if not os.path.exists(logpath):
        os.makedirs(logpath)
    else :
        for filename in os.listdir(logpath):
            if ('py' in filename and 'd' not in filename):
                count += 1

    fh = logging.FileHandler(os.path.join(logpath, 'py-{}.log'.format(count)))
    fh.setLevel(logging.DEBUG)
    fh.setFormatter( logging.Formatter('[%(asctime)s] [%(levelname)s] PID %(process)d: %(message)s',
                                        '%Y-%m-%d %H:%M:%S') )

    return fh

logging.getLogger('gunicorn.error').addHandler(getFileHandler())