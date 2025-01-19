## 2021.4.1 Notes

Though the folder name is not changed, it is now used for GKE deployment.

dockerfile and requirements.txt are the newest in this folder. Please ignore those in parent folder.

## 2021.7.2 Notes

Table of contents:
- [2021.4.1 Notes](#202141-notes)
- [2021.7.2 Notes](#202172-notes)
  - [Dependencies and how to run the code](#dependencies-and-how-to-run-the-code)
  - [Endpoint](#endpoint)
  - [Demo](#demo)
    - [Parts](#parts)
    - [Details](#details)
    - [Notes](#notes)
  - [Method](#method)

### Dependencies and how to run the code

Codes in this folder are written in Python and provides following services in the CogTeach system:

1. Confusion detection
2. Clustering gaze data collected from students to areas of interest (AoIs).

The first service is implemented in `main.py`.

To run the code locally, `requirements.py` gives you the required dependencies. Run command

```
pip install -r /app/requirements.txt
```

to download dependencies.

Then, run command

```
gunicorn -c gunicorn.config.py main:app
```

to start the server.

If you would like to **try out the demo**, please run `main.py` directly using the following command rather than the
previous command:

```
python main.py
```

The server listens at port 8000. To check if the server is correctly running, visit http://127.0.0.1:8000 and the page
should say
> GazeLearning Server: There's nothing you can find here!

### Endpoint

The endpoint of confusion detection is http://127.0.0.1:8000/detection. Data posted to this endpoint should in the
following form:

```javascript
{
    img: base64ImageData, 
    stage: stage, 
    label: label, 
    ver: ver,
    username: username,
    frameId: frameId
}
```

The `img` field contains a base64 encoded facial expression image. You may find
this [link](https://stackoverflow.com/questions/61154353/capture-image-from-webcam-and-convert-to-base64-in-javascript)
helpful to get an image from the camera. You can also check the function `reportState` in `demo/confusion_detection.js`
or `student_client.js` under the folder `/javascript/public/js`.

The `stage` field is used to distinguish between the facial expression collection phase and detection phase. We have
defined three possible values for this field:

```javascript
const COLLECTION = 0; // data collection state
const INFERENCE = 1; // server should predict confusion status
const INCREMENT = 2; // incremental data collection
```

The `label` field is used during the facial expression collection phase. We use the following possible values and you
may use any one from them during the inference/prediction phase:

```javascript
const NOTCOLLECTING = 0;
const CONFUSED = 1; // collecting confused expressions
const NEUTRAL = 2; // collecting neutral expressions
```

The `ver` field is used for incremental learning and it indicates the version of currenct model. This part is being
integrated and you may specify the field as 0.

The `username` field is used to distinguish between different student clients. It should be a number indicating the
identity of student.

The `frameId` field is used in the colletion phase. If we would like to collect 500 frames for confused expressions and
500 frames for neutral expressions, the `frameId` should counts down from 500 to 1. You may set this field to 1 or 0
during the inference phase.

The response is in the following format:

```javascript
{
    result: result
}
```

It takes a **string** from the following list:

```javascript
'success' // collection phase
'Neutral', 'Confused' // inference phase
'N/A' // inference phase, if no face is detected
'ERROR' // when error occurs
```

### Demo

After running `python main.py` to start the server, access page `http://127.0.0.1:8000/demo/confusion_detection.html to
start the demo.

#### Parts

The demo is composed of three parts:

1. Buttons

The buttons on the top are enabled in order to indicate each step of the confusion detection. First confused facial
expressions are collected; then neutral expressions are collected. The server will try an SVM which classifies a face
image as confused ot neutral.

2. Video and canvas elements

These elements are hidden in CogTeach system and is now shown for clarity. The video element is used to stream the video
captured by camera. Frames from the video element are drawn on a canvas element, which are then extracted as a base-64
encoded images.

Check the function `reportState` in `demo/confusion_detection.js`
or `student_client.js` under the folder `/javascript/public/js` for more details.

3. Descriptions

Three descriptions show current states. **Stage** is changed according to a global variable `collecting`. Possible
values are listed in the previous section under the `label` field. **Description** shows some helpful information. **
Prediction** shows the prediction result in the prediction phase.

#### Details

The confusion detection has two phases. The first phase is data collection and the second phase is prediction.

1. Data collection phase

Function `dataCollecting` is responsible for posting captured frames to the server. This function is called every time
camera captures a new frame (set as `onFrame` property of a `Camera` instance). We will check the value of `collecting`:
if it is set to `NOTCOLLECTING`, `dataCollecting` will not be called when `onFrame` is triggered.
Otherwise, `dataCollecting` will post confused/neutral expressions to the server. After collection, `collecting` will be
set as `NOTCOLLECTING` and won't change.

2. Prediction phase

Function `stateInference` is responsible for infer collected facial expression. It is called every second (a pre-defined
parameter `infer_interval`, can be changed) using `setInterval`.

#### Notes

This demo is desinged to better understand the communication steps and test the actual confusion detection algorithm
much easier. **The actual codes implement confusion detection is written in Python code**.

### Method

The method currently being used is: we first crop the image around eyes and eyebrows, and then use PCA to reduce the
dimension of features. The recuded feature is then fed into an SVM. Check the code for more detailed information.

