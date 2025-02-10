# CogTeach

A real-time, multimodal interactive feedback system for online lectures.

Note that this system includes two modes: async mode and sync mode, corresponding to our [PeerEdu](https://github.com/songlinxu/PeerEdu) (CHI 2025) and [Classroom Simulacra](https://arxiv.org/abs/2502.02780) (CHI 2025) paper, respectively.

This repository contains prototype code for the CogTeach system. Please note that some components may be deprecated and
the codebase is not actively maintained.

The system was originally deployed on Google Cloud Platform using Kubernetes and consists of two types of servers:
JavaScript servers for static file hosting and Python servers for computational tasks.

You may need Zoom API key/secret and GazeCloud API key to run some of the codes. Please replace them in the code
accordingly at:

+ Line 15/22 in `javascript/public/js/Zoom/index.js`
+ Line 283 in `javascript/public/js/modules/dataGenerators/GazeEstimator.js`

They may not be needed if async mode is used and WebGazer is selected as the gaze estimator.

This README provides guidance for deploying the system on Google Cloud with Kubernetes and includes hints for local
development and testing.

## Supported modes of the system

### Modes

The system supports the following two modes of running:

+ the asynchronous mode (async mode) and
+ the synchronous mode (sync mode).

The asynchronous mode is defined as using _recorded_ materials as experiment materials, such as recorded lecture videos,
online YouTube videos, and other similar formats. The benefit of using this mode is that it does not require complex
scheduling of experiments. Users can participant experiments at anytime. However, the downside of this mode is that this
is a simulation of real remote lectures and is somehow similar to the existing MOOC systems.

The synchronous mode is defined as having _real-time_ experiments. All participants are agreed to attend the
experiment _at the same time_. This is identical to current formats of online course, online meeting, and other kinds of
collaboration tasks. Clearly, the advantage of this mode is that this best simulates real cases, while it takes a lot of
efforts to manage and organize experiment sessions.

### Switching between modes

By editing the following codes, the system can be switched between two modes. The line number may not be updated
correctly, while the position should be close.

+ JavaScript codes
    + Server side
        + `/javascript/routers`
            + `globalSetting.js`: Line 21. Assign `lectureMode` with value `"async"` to run in the async mode
              and `"sync"` to run
              in the sync mode.

You also need to prepare the following file(s) in the Google Cloud platform. You can access them using an SSH connection
to the `nfs_connected` VM in Compute Engine tab. The path to these files is `/mnt/fileserver/registeredInfo`.

+ The sync mode accesses:
    + `registeredTrials.json`
+ The sync mode accesses:
    + `registeredTalks.json`
    + `talk_0.csv `
    + `talk_1.csv `
    + `talk_2.csv `
    + `talk_3.csv `
    + `talk_4.csv `
    + `user_profile.csv`
+ Both mode in addition access:
    + `registeredStudents.json `
    + `suspension.json`

Please follow the format of existing entries in each file to make modifications.

## Local testing in the async mode

### Running JavaScript servers locally

#### Prerequisites

+ [Node.js](https://nodejs.org/)
+ [npm](https://www.npmjs.com/) (usually comes with Node.js)

Other dependencies are listed under the dependencies and devDependencies keys in the `package.json` file, and are
required to run the JavaScript servers.

#### Installation

1. Clone the repository and navigate to the project directory:

```shell
git clone https://github.com/Voivio/CogTeach
cd CogTeach
```

2. Install the dependencies:

```shell
npm install
```

3. Set up the `fileserver` folder.

```shell
mkdir YOURPATH/fileserver
cd YOURPATH/fileserver
mkdir registeredInfo
```

Please copy the following files from the Google Cloud platform. You can access them using an SSH connection to
the `nfs_connected` VM in Compute Engine tab. The path to these files is `/mnt/fileserver/registeredInfo`.

+ `registeredStudents.json`
+ `registeredTalks.json`
+ `suspension.json`

4. Edit the path to these files in `/javascript/routers/globalSetting.js`. You can simply uncomment Line 3 and comment
   Line 5. Please replace Line 3 with the path of the `fileserver` folder you created.

#### Usage

1. Make sure you have followed the steps in the [Switching between modes](#switching-between-modes) section to switch on
   the async mode.
2. To start the server:

```shell
npm start
```

or

```shell
node server.js
```

The server will be running at http://localhost:5000/.

2. To start the dedicated server:

```shell
node dedicated_server.js
```

The server will be running at http://localhost:5000/ as well.

For testing purpose, it is enough to only start the dedicated server. The dedicated server has integrated the functions
provided by normal servers. This behavior is controlled by the environment variable `NODE_ENV`. If it is not set, the
default behavior is to assume you are working in a development environment. To test the server in production
environment, please set the environment variable `NODE_ENV` as `production`.

```shell
export NODE_ENV="production"
```

#### API Endpoints

The available API endpoints provided by the JavaScript dedicated server are:

+ Administration of the experiment and the system.
    + `GET /admin.html` - The administration portal
    + `/admin`
        + Get stored information
            + `GET /admin/trials` - (For synchronous experiments) To fetch registered experiment trial information
            + `GET /admin/trial` - (For synchronous experiments) To fetch the most recent registered experiment trial
              information
            + `GET /admin/talks` - To fetch experiment talk information
            + `GET /admin/lecture-mode` - To fetch the lecture mode (sync/async) from the remote server
            + `GET /admin/consent-forms` - To fetch consent form links and descriptions
            + `GET /admin/questionnaire` - To fetch subjective questionnaire links and descriptions appears after Talk 1
              and
              4
        + Editing information
            + `POST /admin/confirmation` - For verifying pre/post-lecture test confirmation codes
            + `POST /admin/suspension` - To manage the suspension the service.
            + `POST /admin/talk_history` - (_Deprecated_). This is not used.
+ `POST /createUsers` - Create a new user profile

The available API endpoints provided by JavaScript servers are:

+ `GET /*` - To host all static web pages, scripts, and media that do not require authentication
+ `POST /users` - To authenticate users that are logging in
+ `/student`
    + `GET /student/*.html` - To host webpages that required an authenticated student identity
+ `/teacher`
    + `GET /teacher/*.html` - To host webpages that required an authenticated teacher identity
    + `GET /teacher/studentInfo` - To fetch the information of all registered students
    + `GET /teacher/studentInfo/:stuNum` - To fetch the information of the student specified by `stuNum`
+ `/video`
    + `GET /video/:id` - To host talk videos
    + `GET /video/caption/:id` - To host talk videos captions

When testing locally (`NODE_ENV` not set), the dedicated server also exposes the endpoints provided by JavaScript
servers. This is to reduce the cost of setting up multiple servers. They share the same code, so results on the
dedicated server is guaranteed the same as in servers.

### Running Python server locally

#### Prerequisites

+ [Python 3.x](https://www.python.org/)
+ [pip](https://pip.pypa.io/) (usually comes with Python) or [conda](https://docs.conda.io/en/latest/).

Other dependencies are listed in the file `/python/peer/requirements.txt`. Some important dependencies are:

+ [flask](https://flask.palletsprojects.com/) is a lightweight Python web framework that provides useful tools and
  features for building web applications. It is easy to set up and allows developers to create web applications quickly
  using Python.
+ [Gunicorn](https://gunicorn.org/) is a Python WSGI HTTP Server for UNIX. It is a pre-fork worker model, ported from
  Ruby's Unicorn project. The Gunicorn server is capable of handling multiple concurrent connections, making it a good
  choice for running high-performance web applications in Python.
+ [gevent](http://www.gevent.org/) is a concurrency library for Python based on greenlet and libev. It allows developers
  to write concurrent code using the familiar synchronous coding style. gevent is used for asynchronous I/O, making it a
  useful tool for building fast and scalable network applications in Python.
+ [timeloop](https://pypi.org/project/timeloop/) is a Python library for scheduling and executing tasks at specific
  intervals. It allows developers to schedule tasks to run at certain times or at regular intervals, making it useful
  for tasks such as periodic data updates or automated tasks.

#### Installation

1. Clone the repository and navigate to the project directory:

```shell
git clone https://github.com/Voivio/CogTeach
cd CogTeach
```

2. Install the dependencies:

```shell
pip install -r requirements.txt
```

3. Set up the `fileserver` folder.

```shell
mkdir YOURPATH/fileserver
cd YOURPATH/fileserver
mkdir registeredInfo
```

Please copy the following files from the Google Cloud platform. You can access them using an SSH connection to
the `nfs_connected` VM in Compute Engine tab. The path to these files is `/mnt/fileserver/registeredInfo`.

+ `talk_0.csv`
+ `talk_1.csv`
+ `talk_2.csv`
+ `talk_3.csv`
+ `talk_4.csv`
+ `user_profile.csv`

4. Edit the path to these files in `/python/peer/utilities/global_settings.py`. You can replace the value in Line 9 with
   the path of the `fileserver` folder you created.

#### Usage

1. Start the shared information manager. The manager should be launched before running _any_ Python servers and
   dedicated servers.

```shell
cd YOUR_PROJECT_PATH/python/peer
python shared_info_manager.py
```

The program runs in blocked manner, and it outputs nothing. To end the program, please press `cmd + C` or equivalent
keys
on other platforms.

The shared information manager listens on http://localhost:12580.

Or, you may run command:

```shell
./run.sh
```

This starts both the shared information manager and the Python dedicated server. The shared information manager runs in
background. To shut it down, you have to first find the `pid` and then kill it. Thus, this is not recommended if you are
testing locally.

2. To start the server:

```shell
gunicorn -c gunicorn.config.py server:app
```

You may config the number of concurrent works in the file `gunicorn.config.py`. See the official
documentation [here](https://docs.gunicorn.org/en/stable/settings.html#settings) for a complete list of meaning of the
configuration and other available options.
You may also start the server by running the following command:

```shell
python server.py
```

This runs the flask app directly using its built-in WSGI server instead of using Gunicorn. For testing, this is fine. In
production, we use the Gunicorn server.

The Python server listens at http://localhost:5000. When running together with JavaScript servers, please use a
different port. You may edit the port information in file `/python/peer/utilities/global_settings.py` Line 21 to:

```python
SERVER_PORT = 5001
```

3. To start the dedicated server:

```shell
python dedicated_server.py
```

The Python dedicated server listens at http://localhost:9000.

4. To receive posted data from browser, we have to enable CORS. CORS (Cross-Origin Resource Sharing) is a security
   feature implemented by web browsers that prevents a web page from making requests to a different domain than the one
   that served the page. This is done to protect against malicious websites that could potentially steal sensitive data
   from other websites.
   More information can be found [here](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS). The reason we need to
   enable this is that we are hosting multiple servers (JavaScript server(s) and Python servers(s)) at different
   ports.

To simply put, please uncomment Line 56 - 67 in `server.py` and Line 51 - 61 in `dedicated_server.py`.

5. Finally, to allow the JavaScript server codes post information correctly to Python server, you need to manually
   change the endpoints in JavaScript scripts from `/SOME_ENDPOINT` to `http://127.0.0.1:5001/SOME_ENDPOINT` (handled
   by `server.py`) or `http://127.0.0.1:9000/SOME_ENDPOINT` (handled by `dedicated_server.py`) (assuming Python server
   listens at port `5001` and the Python dedicated server listens at port `9000`). Otherwise, the default
   address `http://127.0.0.1:5000` is used, which is the JavaScript server address.

The list of parts to be changed are listed as follows (assuming Python server listens at port `5001` and the Python
dedicated server listens at port `9000`). The line number may not be updated correctly, while the position should be
close.

+ `/javascript/public/js`
    + `/modules`
        + `studentSyncProcedure.js`: Line 37 in the `sync()` function. `'/service/workshop'`
          to `'http://127.0.0.1:5001/service/workshop'`
    + `adminAsyncUpdates.js`: Line 89 in `workshopInfoHandler()` function. `"/internal/update"`
      to `"http://127.0.0.1:9000/internal/update"`
    + `globalSetting.js`: Line 211 in `fetchTalkSetting()` function. `"/workshop/view_numbers"`
      to `"http://127.0.0.1:9000/workshop/view_numbers"`
    + `index.js`: Line 283 in `createNewUser()` function. `"/internal/update"`
      to `"http://127.0.0.1:9000/internal/update"`
    + `workshopClient.js`: Line 286 in `prepareProcedure()` function. `"/service/image"`
      to `"http://127.0.0.1:5000/service/image"`
    + `talkSelection.js`:
        + Line 46 `fetchUserProfile()` function. `"workshop/progress"` to `"http://127.0.0.1:9000/workshop/progress"`
        + Line 167 `checkSingleTalkWatchReviewCondition()` function. `"workshop/progress"`
          to `"http://127.0.0.1:9000/workshop/progress"`
        + Line 584 `onsubmit()` function. `"workshop/progress"` to `"http://127.0.0.1:9000/workshop/progress"`

**WARNING**: Never push these changes on endpoints to this repo. This results in wrong endpoints in production.

#### Endpoints

The available API endpoints provided by the Python dedicated server are:

+ `GET /` - To check if the server is listening.
+ Managing administration information. All such endpoints start with `workshop` with one exception that starts
  with `internal`.
    + `/workshop`
        + `POST /workshop/update` - (For synchronous experiments) To fetch registered experiment trial information
        + `POST /workshop/progress` - To fetch the information on the progress of a specific student.
        + `GET /workshop/view_numbers` - To fetch the information of how many times the student have watched a lecture
          and the corresponding setting. However, now this is decided by the group the student belongs to. Though the
          same endpoint is used, the logic is different from what it originally tended.
    + `/internal`
        + `POST /internal/update` - Used by the administrator to interact with the information in server.
+ For testing. All such endpoints start with `/internal/testing`.
    + `/internal/testing`
        + `GET /internal/testing/set_entry` - To set an entry in the shared info manager
        + `GET /internal/testing/get_entry` - To get an entry in the shared info manager
        + `GET /internal/testing/csv_logger` - To fetch the information about CSV logger, which materialize all received
          data
        + `GET /internal/testing/shutdown` - To manage the termination of the dedicated server.

The available API endpoints provided by Python servers are:

+ `GET /` - To check if the server is listening.
+ To receive, process, and forward data. All endpoints start with `/service`
    + `/service`
        + `POST /service/saliency` - (For synchronous experiment) To handle the request form teacher to update the
          slide.
        + `POST /service/cluster` - (For synchronous experiment) To cluster the gaze data posted by students.
        + `POST /service/workshop` - To handle the information posted from each student participant.
        + `POST /service/image` - To save facial expressions collected.
        + `POST /service/visual_cue` - (_Deprecated_) To provide visual cues back to the students. This is not used.
          Visual cues are generated using VTT files.

The Python dedicated server does not provide functions in the Python server(s). So you have to run both.

### Summary

To run CogTeach locally in the async mode, please:

1. Change the mode by following the steps in the [Switching between modes](#switching-between-modes) section
2. Prepare files in the `registeredInfo` folder
3. Modify all endpoints as listed in Step 5 from the Usage section of running Python servers locally
4. Start the JavaScript dedicated server (JavaScript server functions are provided.)
5. Start the shared information manager
6. Start the Python dedicated server _and_ Python server (no order requirement enforced)

## Local testing in the sync mode

### Running JavaScript servers locally

#### Prerequisites and Installation

See the [Local testing in the async mode](#local-testing-in-the-async-mode) section.

#### Usage

1. Make sure you have followed the steps in the [Switching between modes](#switching-between-modes) section to switch on
   the sync mode.
2. See the [Local testing in the async mode](#local-testing-in-the-async-mode) section.
3. Update `registeredTrials.json` file. All registered trials are filtered based on the time to start of all lectures.
   If no lecture starts in 30 minutes, no users can access the system. Please modify the trials information with at
   least one is about to start in 30 minutes. One can generate the timestamp by running:

```javascript
new Date('Wed Jan 1 2020 12:00:00 GMT-0800').getTime()
// expected output: 1577908800000
```

The list of lectures is updated every 5 minutes. One may need to change the start time again when trials expire.

4. For local testing, since we have two identities (the student/instructor identity), it is needed to simultaneously
   start both sides. However, the system uses cookie(s) to manage identity information. There are two possible ways:
    1. Using two _different_ browsers (such as Chrome and Firefox) to run different sides.
    2. Using one browser but with one window in the normal mode and the other window in the Incognito mode.
5. The procedure of an online experiment trial should be as follows.
    1. The instructor enters the system.
    2. The instructor starts to share the screen.
        1. Please make sure the slide in presented in the main screen, not in the side film. This is required by
           capturing screenshots.
    3. Students are allowed to log in 30 minutes before the start time of this trial.
        1. We enforce group matching. Not only the name should present in the `registeredStudents.json`, the group of
           the student should match the group of the trial.
    4. Students enter the system 10 minutes before the start time of this trial.
    5. The instructor sends out the pre-test link.
    6. The instructor clicks the `Send Start` button to trigger data synchronization.
        1. Students receive the command and begin to post data.
        2. The chat and film on the right are toggled off.
        3. The data synchronization _only_ starts after the scheduled time of trial. If the `start` event is sent before
           the scheduled time, the system manages a counter to count down till the scheduled time.
    7. The instructor clicks the `Send End` button to terminate data synchronization.
    8. The instructor sends out the post-test link.

#### API Endpoints

+ Administration of the experiment and the system.
    + `GET /admin.html` - The administration portal
    + `/admin`
        + `GET /admin/trials` - (For synchronous experiments) To fetch registered experiment trial information
        + `GET /admin/trial` - (For synchronous experiments) To fetch the most recent registered experiment trial
          information
+ socket.io connection. The namespace is `"/admin"`. This is used for messaging between server(s) and clients. The
  following events are defined:
    + `connection` - To handle newly joined users, including students, instructor(s), and administrator(s)
    + `disconnect` - To handle the disconnection of users, including students, instructor(s), and administrator(s)
    + `start` - To start all data transmission
    + `end` - To terminate all data transmission
    + `trigger-student-start` - (_Deprecated_) To notify student users the beginning of data synchronization
    + `trigger-teacher-start` - (_Deprecated_) To notify instructor users and admin users the beginning of data
      synchronization

The available API endpoints provided by JavaScript servers are:

+ `GET /*` - To host all static web pages, scripts, and media that do not require authentication
+ `POST /users` - To authenticate users that are logging in
+ `/student`
    + `GET /student/*.html` - To host webpages that required an authenticated student identity
+ `/teacher`
    + `GET /teacher/*.html` - To host webpages that required an authenticated teacher identity
    + `GET /teacher/studentInfo` - To fetch the information of all registered students
    + `GET /teacher/studentInfo/:stuNum` - To fetch the information of the student specified by `stuNum`

### Running Python server locally

#### Prerequisites, Installation, and Usage

1. Make sure you have followed the steps in the [Switching between modes](#switching-between-modes) section to switch on
   the sync mode.
2. See the [Local testing in the async mode](#local-testing-in-the-async-mode) section.
3. Similarly, the endpoints should be changed. However, the list is shorter.

+ `/javascript/public/js`
    + `/modules`
        + `studentSyncProcedure.js`: Line 37 in the `sync()` function. `'/service/workshop'`
          to `'http://127.0.0.1:5001/service/workshop'`
    + `workshopClient.js`: Line 147 in `onCameraSelection()` function. `"/service/image"`
      to `"http://127.0.0.1:5000/service/image"`

**WARNING**: Never push these changes on endpoints to this repo. This results in wrong endpoints in production.

#### API Endpoints

The available API endpoints provided by the Python dedicated server are:

+ `GET /` - To check if the server is listening.
+ Managing administration information. All such endpoints start with `workshop` with one exception that starts
  with `internal`.
    + `/workshop`
        + `POST /workshop/update` - (For synchronous experiments) To fetch registered experiment trial information

The available API endpoints provided by Python servers are:

+ `GET /` - To check if the server is listening.
+ To receive, process, and forward data. All endpoints start with `/service`
    + `/service`
        + `POST /service/saliency` - (For synchronous experiment) To handle the request form teacher to update the
          slide.
        + `POST /service/cluster` - (For synchronous experiment) To cluster the gaze data posted by students.

### Summary

To run CogTeach locally in the sync mode, please:

1. Change the mode by following the steps in the [Switching between modes](#switching-between-modes) section
2. Prepare files in the `registeredInfo` folder
3. Modify all endpoints as listed in Step 3 from the Usage section of running Python servers locally
4. Start the JavaScript dedicated server (JavaScript server functions are provided.)
5. Start the shared information manager
6. Start the Python dedicated server _and_ Python server (no order requirement enforced)

## Acknowledgement

Some part of the codes are based on [WebGazer.js](https://webgazer.cs.brown.edu/).
