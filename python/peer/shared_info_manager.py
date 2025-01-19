from multiprocessing import Lock, Queue
from multiprocessing.managers import BaseManager, AcquirerProxy, DictProxy, ListProxy, ValueProxy
from multiprocessing.managers import Value


class MyManager(BaseManager):
    pass


def config_server(host, port, key):
    """
    Return a remote server.

    See https://docs.python.org/3/library/multiprocessing.html#customized-managers.
    :param host: The host IP.
    :param port: The port it listens.
    :param key: A pass phrase.
    :return: A manager instance.
    """
    shared_dict = {}
    """Clustering related-information"""
    shared_slide_id = Value("i", -1)
    shared_slide_aspect_ratio = Value('d', 0.0)
    shared_chulls = []
    """Global status. Key: stuNum. Value: StudentInfo.  Use dict to replace the old data."""
    get_student_info = {}
    """Queue for gaze information and reported confusion."""
    shared_queue = Queue()
    """Multiprocessing management"""
    shared_lock = Lock()

    MyManager.register("get_dict", callable=lambda: shared_dict, proxytype=DictProxy)
    MyManager.register("get_lock", callable=lambda: shared_lock, proxytype=AcquirerProxy)

    MyManager.register("get_slide_id", callable=lambda: shared_slide_id, proxytype=ValueProxy)
    MyManager.register("get_slide_aspect_ratio", callable=lambda: shared_slide_aspect_ratio, proxytype=ValueProxy)

    MyManager.register("get_chulls", callable=lambda: shared_chulls, proxytype=ListProxy)

    MyManager.register("get_student_info",
                       callable=lambda: get_student_info,
                       proxytype=DictProxy)
    MyManager.register("get_queue",
                       callable=lambda: shared_queue)

    manager = MyManager((host, port), key)
    return manager


def start_server(host, port, key):
    print("State information manager server started.")
    manager = config_server(host, port, key)
    s = manager.get_server()
    s.serve_forever()
    # manager.start()


def config_client(host, port, key):
    MyManager.register("get_dict", proxytype=DictProxy)
    MyManager.register("get_lock", proxytype=AcquirerProxy)

    MyManager.register("get_slide_id", proxytype=ValueProxy)
    MyManager.register("get_slide_aspect_ratio", proxytype=ValueProxy)
    MyManager.register("get_chulls", proxytype=ListProxy)

    MyManager.register("get_student_info", proxytype=DictProxy)
    MyManager.register("get_queue")

    return MyManager((host, port), key)


def connect_to_server(host, port, key):
    manager = config_client(host, port, key)
    manager.connect()
    return manager


if __name__ == "__main__":
    """Start to listen connection requests from other processes.
    
    The server listens to localhost:MANAGER_PORT defined in utilities.global_settings.
    """
    from utilities.global_settings import MANAGER_PORT, SECRET

    # t_server = Thread(target=start_server, args=("", MANAGER_PORT, SECRET), daemon=True)
    # t_server.start()
    manager = config_server("", MANAGER_PORT, SECRET)
    s = manager.get_server()
    s.serve_forever()
