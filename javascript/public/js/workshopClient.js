import StudentProcedure from "./modules/studentProcudure.js";
import dataManagerFactory from "./modules/DataManager.js";
import expressionCollectorFactory from "./modules/dataGenerators/FacialExpCollector.js";
import gazeEstimatorFactory from "./modules/dataGenerators/GazeEstimator.js";
import confusionReporterFactory from "./modules/dataGenerators/ConfusionReporter.js";
import mouseEventListenerFactory from "./modules/dataGenerators/MouseEventListener.js";
import inattentionReporterFactory from "./modules/dataGenerators/InattentionReporter.js";
import syncProcedureFactory from "./modules/studentSyncProcedure.js";

let procedure;
let socket;
const lectureMode = "async";

document.addEventListener("DOMContentLoaded", () => {
    openModal("init-modal");
});

/**
 * The whole procedure would be:
 * window.onload (init settings/socket/jitsi) =>
 * selectCamera() (select the camera to be used when multiple cams are detects) =>
 * onCameraSelection() (callback) =>
 * pre-lecture test =>
 * onCalibrationEnd() (triggers facial exp collection) =>
 * onCalibrateEnd() (block before auto sync) =>
 * playback =>
 * playback end =>
 * post lecture test
 */
window.onload = async function () {
    // fetch experiment setting
    console.log('========== Fetching settings ==========');
    try {
        await fetchSetting(lectureMode);
    } catch (e) {
        console.error('Failed to fetch experiment setting.');
        console.warn('Will use default setting.');
    }
    displayTrialSetting();

    // examine whether the user is allowed to visit this page.
    // visiting a formal talk when intro is not finished
    // reviewing a page without completing all lectures. can be done by go back to previous page
    if (refuse) {
        document.getElementById("init-title").innerText = "Sorry...";
        document.getElementById("init-description-0").innerText = refuse;
        document.getElementById("init-description-1").hidden = false;
        document.getElementById("init-go-back-btn").hidden = false
        return
    }

    // Check if we use socket to control procedure or not.
    if (SOCKET) {
        socket = setupSocket();
        window.socket = socket;
    }

    let containerRect = document.getElementById("container").getBoundingClientRect();
    maxH = containerRect.height;
    maxW = containerRect.width;
    cog_width = 0.5 * maxW;
    cog_height = Math.max(0.1 * maxH, 80);

    // get the link to pre/post lecture tests
    const preTestLink = document.getElementById("pre-test-link"),
        postTestLink = document.getElementById("post-test-link");
    const talkId = +localStorage.getItem("talkId")
    fetch("/admin/talks").then(
            res => res.json()
        ).then(talkInfo => {
            // in case of only one talk to be completed by each user.
            let talk = talkInfo[talkId] ? talkInfo[talkId] : talkInfo[0];
            let preTestURL = talk["pre-test-link"],
                postTestURL = talk["post-test-link"];
            preTestLink.href = preTestURL;
            preTestLink.innerText = preTestURL;
            postTestLink.href = postTestURL;
            postTestLink.innerText = postTestURL;
        })
    // send startTime to server
    uploadCheckpoint("start_time");

    const video = document.getElementById("talk-video"),
        videoSrc = document.getElementById("talk-video-source"),
        textTrack = document.getElementById("talk-video-visual-cue"),
        subtitleTrack = document.getElementById("talk-video-subtitles");
    if (talkId === 0) {
        videoSrc.src = `/video/${talkId}-0`;
        subtitleTrack.src = `/video/caption/${talkId}-0`;
        // see https://developer.mozilla.org/en-US/docs/Web/API/TextTrack/mode.
        textTrack.track.mode = "disabled";
        subtitleTrack.track.mode = "showing";
        video.setAttribute("preload", "auto");
        video.load();
        document.getElementById("init-title").innerText = "All set!";
        document.getElementById("init-description-0").innerText = "Are you ready for the workshop?";
        document.getElementById("init-btn").addEventListener("click", ()=>{
            closeModal("init-modal");
            video.play();
        })
        document.getElementById("init-btn").hidden = false;

        video.addEventListener("ended", () => {
            openModal("camera-modal");
            selectCamera(onCameraSelection);
            videoSrc.src = `/video/${talkId}-1`;
            subtitleTrack.src = `/video/caption/${talkId}-1`;
            video.load();
            video.addEventListener("ended", endVideo);
        }, {once: true});
    } else {
        videoSrc.src = `/video/${talkId}`;
        textTrack.src = `/video/caption/${talkId}`;

        video.setAttribute("preload", "auto");
        video.load();

        document.getElementById("init-title").innerText = "Would you like to change the size of browser window?";
        document.getElementById("init-description-0").innerText = "If you would like to resize the window, please adjust it at this step.";
        document.getElementById("init-btn").addEventListener("click", ()=>{
            closeModal("init-modal");
            openModal("camera-modal");
            selectCamera(onCameraSelection);
        })
        document.getElementById("init-btn").hidden = false;

        // procedure after video
        video.addEventListener("ended", endVideo);
    }
}

function onCameraSelection() {
    closeModal("camera-modal");
    openModal("pre-test-modal");
    // Send pre-test begin time
    uploadCheckpoint("pre_test_start_time");

    prepareProcedure();
    procedure.init();

    setUpClickHandler(procedure);
}

function setUpClickHandler() {
    document.getElementById("pre-test-btn").addEventListener("click", () => {
        fetch("/admin/confirmation", {
            method: "POST",
            body: JSON.stringify({
                talkId: localStorage.getItem("talkId"),
                testName: "pre-test",
                code: getOTPCode("pre-test"),
            })
        }).then(res => res.json())
            .then((match) => {
                if (match) {
                    // the participant has finished the test
                    // Send pre-test end time
                    uploadCheckpoint("pre_test_end_time");
                    closeModal("pre-test-modal");
                    openModal("calibration-modal");
                } else {
                    // the user failed to offer the correct code
                    document.getElementById("pre-test-description-3").hidden = false;
                }
            })
    })

    document.getElementById("pre-test-close-btn").addEventListener("click", () => {
        uploadCheckpoint("pre_test_end_time");
        closeModal("pre-test-modal");
        openModal("calibration-modal");
    })

    document.getElementById("calibration-btn").addEventListener("click", () => {
        closeModal('calibration-modal');
        procedure.calibrateExpCollector();
        procedure.calibrateGazeEstimator(() => {
                // Send calibration start time
                uploadCheckpoint("calibration_start_time")
            }
        )
    })

    document.getElementById("calibration-close-btn").addEventListener("click", () => {
        uploadCheckpoint("calibration_start_time");
        closeModal('calibration-modal');
        procedure.calibrateExpCollector();
        // Send calibration end time
        uploadCheckpoint("calibration_end_time");
        startSync();
    })

    document.getElementById("post-test-btn").addEventListener("click", () => {
        fetch("/admin/confirmation", {
            method: "POST",
            body: JSON.stringify({
                talkId: localStorage.getItem("talkId"),
                testName: "post-test",
                code: getOTPCode("post-test"),
            })
        }).then(res => res.json())
            .then((match) => {
                if (match) {
                    // the participant has finished the test
                    // Send post-test end time
                    uploadCheckpoint("post_test_end_time").then(()=>{
                        closeModal("post-test-modal");
                        endTalk();
                    })
                } else {
                    // the user failed to offer the correct code
                    document.getElementById("post-test-description-3").hidden = false;
                }
            })
    })

    document.getElementById("post-test-close-btn").addEventListener("click", () => {
        uploadCheckpoint("post_test_end_time").then(()=>{
            closeModal("post-test-modal");
            endTalk();
        })
    })

    OTPInput("pre-test");
    OTPInput("post-test");
}

function startSync() {
    // all required steps before video are done.
    const video = document.getElementById("talk-video");
    video.play().then(() => {
        console.log('========== Synchronizing ==========');
        // send videoStartTime
        uploadCheckpoint("video_start_time");
        procedure.sync();
    })
}

function endTalk() {
    // notify js server you have finished one talk
    uploadCheckpoint("end_time").then(
        () => {
            localStorage.removeItem("talkId");
            window.open("/student/talkSelection.html", "_self");
        }
    )
}

function endVideo() {
    // send video end time to server
    uploadCheckpoint("video_end_time");
    procedure.end();
    uploadCheckpoint("post_test_start_time");

    openModal("post-test-modal");
}

function prepareProcedure() {
    const settings = {
        environment: "development",
        shareGazeInfo: shareGazeInfo,
        shareCogInfo: shareCogInfo,
        gazeEstimatorName: gazeEstimatorName,
        facialExpCollectorName: facialExpCollectorName,
        visualizerNames: visualizerNames,
        confusionReporterName: confusionReporterName,
    }, configurations = {
        gazeEstimatorConfig: {
            onResult: (gazeData) => {
                gazeVisualize(gazeData);

            },
            onCalibrationEnd: () => {
                // Send calibration end time
                uploadCheckpoint("calibration_end_time");
                startSync();
            },
            informLostFace: true
        },
        expressionCollectorConfig: {
            total,
            onCollectEnd: () => {},
            constraint: {
                width: { ideal: 4096 },
                height: { ideal: 2160 },
                deviceId: cameraId,
            },
            endpoint: "/service/image",
        },
        AoIConfig: {
            animationTime,
            showTransition: false,
            showLabel: false,
        },
        cogBarConfig: {margin, xOffset: cog_width, yOffset: "2%", cog_width, cog_height, animationTime},
        actionConfig: {
            margin,
            xOffset: cog_width,
            yOffset: 0,
            act_width: cog_width,
            act_height: cog_height,
            animationTime
        }
    };

    procedure = procedureFactory(settings, configurations);
    window.procedure = procedure;
}

function gazeVisualize(GazeData) {
    /*
    GazeData.state // 0: valid gaze data; -1 : face tracking lost, 1 : gaze uncalibrated
    GazeData.docX // gaze x in document coordinates
    GazeData.docY // gaze y in document coordinates
    GazeData.time // timestamp
    */
    let docX = GazeData.docX;
    let docY = GazeData.docY;

    let gaze = document.getElementById("gaze");

    if (gaze) {
        switch (GazeData.state) {
            case 0:
                // 0: valid gaze data
                // Visualize gaze with DOM div element #gaze
                docX -= gaze.clientWidth / 2;
                docY -= gaze.clientHeight / 2;
                gaze.style.left = docX + "px";
                gaze.style.top = docY + "px";
                if (gaze.style.display === 'none')
                    gaze.style.display = 'block';
                break;
            case -1:
                // -1 : face tracking lost
                // Hide gaze visualization
                // The value of gazeX/gazeY stays same as last valid gaze
                if (gaze.style.display === 'block')
                    gaze.style.display = 'none';
                break;
            case 1:
                // 1 : gaze uncalibrated
                // Hide gaze visualization
                // The value of gazeX/gazeY stays same as last valid gaze
                if (gaze.style.display === 'block')
                    gaze.style.display = 'none';
                break;
        }
    }
}

function procedureFactory(settings, configurations) {
    const videoElement = document.getElementById('input_video'),
        outputElement = document.getElementById('output_canvas'),
        outputCtx = outputElement.getContext('2d');

    let camera = new Camera(videoElement, {
        onFrame: () => {
            outputCtx.drawImage(videoElement, 0, 0, outputElement.width, outputElement.height);
        },
        width: { ideal: 4096 },
        height: { ideal: 2160 },
        deviceId: cameraId,
    });

    let dataManager = dataManagerFactory(userInfo.identity, "async");

    let gazeEstimator = gazeEstimatorFactory(settings, configurations.gazeEstimatorConfig, dataManager),
        expressionCollector = expressionCollectorFactory(settings, configurations.expressionCollectorConfig, camera, dataManager),
        confusionReporter = confusionReporterFactory(settings, dataManager),
        mouseEventListener = mouseEventListenerFactory(dataManager),
        inattentionReporter = inattentionReporterFactory(dataManager),
        syncProcedure = syncProcedureFactory(settings, configurations, confusionReporter, mouseEventListener, dataManager);

    dataManager.subscribe(gazeEstimator);
    dataManager.subscribe(expressionCollector);
    dataManager.subscribe(confusionReporter);
    dataManager.subscribe(mouseEventListener);
    dataManager.subscribe(inattentionReporter);

    const video = document.getElementById("talk-video");
    video.addEventListener("pause", () => {
        dataManager.addInattention("video-paused");
        uploadCheckpoint("video_paused", video.currentTime);
    })
    video.addEventListener("playing", () => {
        dataManager.addInattention("video-playing");
    })

    // handling the generation of AoIs
    let textTrackElem = document.getElementById("talk-video-visual-cue");
    textTrackElem.addEventListener("cuechange", (event) => {

        let cues = event.target.track.activeCues[0],
            aoi_information = JSON.parse(cues.text);

        let mock_res = {
            slide_id: aoi_information.slide_id,
            aois: aoi_information.aoi_list,
            slide_aspect_ratio: 960 / 540,
        };

        syncProcedure.visualize(mock_res);
    });

    return new StudentProcedure(
        gazeEstimator, expressionCollector, inattentionReporter, mouseEventListener, syncProcedure
    );
}

/**
 * Set up the socket connection with the dedicated JS server.
 * @returns {*}
 */
function setupSocket() {
    const socketEndpoint = "/admin";
    const s = io(socketEndpoint, {
        auth: {
            identity: userInfo.identity,
            name: userInfo.name,
        },
        // autoConnect: false
    });
    s.connect();

    window.addEventListener("beforeunload", function (event) {
        s.disconnect();
    });

    s.on("student start", () => {
        if (!SYNCING) {
            // Avoids opening the calibrate modal too many times.
            openModal('calibrate-modal');
            SYNCING = true;
        } else {
            console.debug("Student start event has already been received,");
        }
    });
    s.on("start", () => {
        if (!SYNCING) {
            // Avoids opening the calibrate modal too many times.
            openModal('calibrate-modal');
            SYNCING = true;
        } else {
            console.debug("Start event has already been received,");
        }
    });
    s.on("end", () => {
        // Chat is recovered after sync
        procedure.end();
    });

    return s
}

function uploadCheckpoint(checkpointName, timestamp) {
    return fetch("/workshop/progress", {
        method: 'POST',
        body: JSON.stringify({
            userInfo: userInfo,
            talkId: localStorage.getItem("talkId"),
            checkpoint: checkpointName,
            timestamp: timestamp ? timestamp : Date.now(),
        })
    }).then(res => res.json())
        .then(data => console.log(data))
        .catch(err => console.error(err))
}

function OTPInput(name) {
    const inputs = document.querySelectorAll(`input[id^=${name}]`);
    for (let i = 0; i < inputs.length; i++) {
        inputs[i].addEventListener('keydown', function (event) {
            if (event.key === "Backspace") {
                if (inputs[i].value !== '') {
                    // stay at the input if there is a value inputted
                    inputs[i].value = '';
                } else {
                    // remove the value of previous input
                    inputs[i].value = '';
                    if (i !== 0) inputs[i - 1].focus();
                }
            } else {
                if (i === inputs.length - 1 && inputs[i].value !== '') {
                    return true;
                } else if (event.keyCode > 47 && event.keyCode < 58) {
                    inputs[i].value = event.key;
                    if (i !== inputs.length - 1) inputs[i + 1].focus();
                    event.preventDefault();
                } else if (event.keyCode > 64 && event.keyCode < 91) {
                    inputs[i].value = String.fromCharCode(event.keyCode);
                    if (i !== inputs.length - 1) inputs[i + 1].focus();
                    event.preventDefault();
                }
            }
        });
    }
}

function getOTPCode(name) {
    const inputs = document.querySelectorAll(`input[id^=${name}]`)
    let codes = [];
    inputs.forEach(input => codes.push(input.value));
    return codes.join("")
}
