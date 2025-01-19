## set base image (host OS)
#FROM python:3.8
#
## set the working directory in the container
#WORKDIR /code
#
## copy the dependencies file to the working directory
#COPY requirements.txt .
#
## install dependencies
#RUN pip install -r requirements.txt \
#    && pip cache purge
#
## copy the content of the local src directory to the working directory
#COPY . .
#
## command to run on container start
#CMD [ "python", "./inferserver.py" ]

# ===========================================

# Copyright 2019 The MediaPipe Authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# FROM ubuntu:18.04

# MAINTAINER <mediapipe@google.com>

# WORKDIR /io
# WORKDIR /mediapipe

# ENV DEBIAN_FRONTEND=noninteractive

# RUN apt-get update && apt-get install -y --no-install-recommends \
#         build-essential \
#         ca-certificates \
#         curl \
#         ffmpeg \
#         git \
#         wget \
#         unzip \
#         python3-dev \
#         python3-opencv \
#         python3-pip \
#         libopencv-core-dev \
#         libopencv-highgui-dev \
#         libopencv-imgproc-dev \
#         libopencv-video-dev \
#         libopencv-calib3d-dev \
#         libopencv-features2d-dev \
#         software-properties-common && \
#     add-apt-repository -y ppa:openjdk-r/ppa && \
#     apt-get update && apt-get install -y openjdk-8-jdk && \
#     apt-get clean && \
#     rm -rf /var/lib/apt/lists/*

# RUN pip3 install --upgrade setuptools
# RUN pip3 install wheel
# RUN pip3 install future
# RUN pip3 install six==1.14.0
# RUN pip3 install tensorflow==1.14.0
# RUN pip3 install tf_slim

# RUN ln -s /usr/bin/python3 /usr/bin/python

# # Install bazel
# ARG BAZEL_VERSION=3.4.1
# RUN mkdir /bazel && \
#     wget --no-check-certificate -O /bazel/installer.sh "https://github.com/bazelbuild/bazel/releases/download/${BAZEL_VERSION}/b\
# azel-${BAZEL_VERSION}-installer-linux-x86_64.sh" && \
#     wget --no-check-certificate -O  /bazel/LICENSE.txt "https://raw.githubusercontent.com/bazelbuild/bazel/master/LICENSE" && \
#     chmod +x /bazel/installer.sh && \
#     /bazel/installer.sh  && \
#     rm -f /bazel/installer.sh

# COPY . /mediapipe/

# If we want the docker image to contain the pre-built object_detection_offline_demo binary, do the following
# RUN bazel build -c opt --define MEDIAPIPE_DISABLE_GPU=1 mediapipe/examples/desktop/demo:object_detection_tensorflow_demo

# ===========================================

FROM python:3.8

# Create a virtualenv for dependencies. This isolates these packages from
# system-level packages.
# Use -p python3 or -p python3.7 to select python version. Default is version 2.
# RUN virtualenv /env -p python3.7

# Setting these environment variables are the same as running
# source /env/bin/activate.
# ENV VIRTUAL_ENV /env
# ENV PATH /env/bin:$PATH

RUN apt-get update \
   && apt-get install -y libgl1-mesa-glx \
   && rm -rf /var/lib/apt/lists/*

# Copy the application's requirements.txt and run pip to install all
# dependencies into the virtualenv.
ADD requirements.txt /app/requirements.txt
RUN /usr/local/bin/python -m pip install --upgrade pip\
   && pip install -r /app/requirements.txt \
   && pip cache purge

# Add the application source code.
ADD . /app

# Run a WSGI server to serve the application. gunicorn must be declared as
# a dependency in requirements.txt.
WORKDIR /app
#CMD []
CMD [ "/bin/bash", "-c", "gunicorn -c gunicorn.config.py main:app"]
# 2021.4.1 Python server is responsible for both confusion detection (distributed) and clustering (single server)

# ENV PORT=8000
# ENV STORAGEPATH='/mnt/fileserver/'
# CMD [ "/bin/bash", "-c", "gunicorn -b :8000 main:app", "--error-logfile $STORAGEPATH$(date +\"%Y_%m_%d_%I_%M_%p\")_gunicorn.log", "--log-file $STORAGEPATH$(date +\"%Y_%m_%d_%I_%M_%p\")_gunicorn.log", "--capture-output" ]
# In case I need better log.
# gunicorn -b :8000 main:app --error-logfile "$STORAGEPATH$(date +"%Y_%m_%d_%I_%M_%p")_gunicorn.log", --log-file "$STORAGEPATH$(date +"%Y_%m_%d_%I_%M_%p")_gunicorn.log" --capture-output
