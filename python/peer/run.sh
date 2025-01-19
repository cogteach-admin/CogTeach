# used by dedicated server, because we need to start the shared_info_manager first.
nohup python -u shared_info_manager.py > "/mnt/fileserver/logs/shared_info_manager.log" &
python dedicated_server.py