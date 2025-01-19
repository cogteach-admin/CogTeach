# set base image (host OS)
FROM python:3.8
ENV GUNICORN_ENV="production"

# set the working directory in the container
WORKDIR /app

# copy the dependencies file to the working directory
COPY requirements.txt .

# install dependencies
RUN pip install -r requirements.txt \
   && pip cache purge

# copy the content of the local src directory to the working directory
COPY . .

# command to run on container start
# CMD [ "python", "server.py" ]
CMD [ "/bin/bash", "-c", "gunicorn -c gunicorn.config.py server:app"]