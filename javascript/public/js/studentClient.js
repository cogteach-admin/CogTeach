import StudentProcedure from "./modules/studentProcudure.js";
import dataManagerFactory from "./modules/DataManager.js";
import expressionCollectorFactory from "./modules/dataGenerators/FacialExpCollector.js";
import gazeEstimatorFactory from "./modules/dataGenerators/GazeEstimator.js";
import confusionReporterFactory from "./modules/dataGenerators/ConfusionReporter.js";
import mouseEventListenerFactory from "./modules/dataGenerators/MouseEventListener.js";
import inattentionReporterFactory from "./modules/dataGenerators/InattentionReporter.js";
import syncProcedureFactory from "./modules/studentSyncProcedure.js";

document.addEventListener("DOMContentLoaded", () => {
    openModal("camera-modal");
});

let procedure;
let socket;

/**
 * The whole procedure would be:
 * window.onload (init settings/socket/jitsi) =>
 * selectCamera() (select the camera to be used when multiple cams are detects) =>
 * onCameraSelection() (callback, opens blocking before 10 mins) =>
 * calibrationCountDown() (counting down for 10 mins) =>
 * [SOCKET TAKES CONTROL HERE] Calibrate modal is opened by socket rather than ballback.
 * onCalibrationEnd() (triggers facial exp collection) =>
 * onCalibrateEnd() (block before auto sync)
 */
window.onload = async function () {
    // Fetch experiment setting
    console.log('========== Fetching settings ==========');
    try {
        await fetchSetting();
    } catch (e) {
        console.error('Failed to fetch experiment setting.');
        console.warn('Will use default setting.');
    }
    displayTrialSetting();

    // Check if we use socket to control procedure or not.
    if (SOCKET) {
        socket = setupSocket();
        window.socket = socket;
    }

    // Set up the Jitsi meeting. Only specified buttons are enabled.
    const config = {
        startWithAudioMuted: true,
        // startWithVideoMuted: false,
        // See https://github.com/jitsi/jitsi-meet/pull/3518
        // helps mobile users
        disableDeepLinking: true,
        disablePolls: true,
        toolbarButtons: ['camera', 'microphone', 'chat', 'hangup'],
        buttonsWithNotifyClick: ['chat'],
        apiLogLevels: ['warn', 'error'],
    }
    await initialiseJitsi(config);
    // Taking over the chat box management.
    _jitsi.addListener("toolbarButtonClicked", watchedChat);
    _jitsi.addListener("chatUpdated", chatListener)

    let containerRect = document.getElementById("container").getBoundingClientRect();
    maxH = containerRect.height;
    maxW = containerRect.width;
    cog_width = 0.5 * maxW;
    cog_height = Math.max(0.1 * maxH, 80);

    selectCamera(onCameraSelection);
}

function calibrationCountDown(procedure) {
    console.log('========== Preparing ==========');
    procedure.init();

    if (lectureInfo === null) {
        document.getElementById("before-lecture-modal-description").innerText = 'No upcoming lecture. Please be back later.';
        return
    }

    // If socket is enabled, we do not need to leave 10 mins for users to calibrate
    const blockEndTime = lectureInfo.lecture.time - hms2timestamp(0, 10, 0)
    hold(
        blockEndTime,
        delay => {
            document.getElementById("before-lecture-modal-description")
                .innerText = timeFormatter(delay + hms2timestamp(0, 10, 0));
        },
        1000
    ).then(() => {
        closeModal('before-lecture-modal');
        if (!SOCKET) {
            openModal('calibrate-modal');
        }
    }).catch(err => console.error(err));
}

function onCollectEnd() {
    hold(
        lectureInfo.lecture.time,
        () => {
        },
        1000
    ).then(() => {
        console.log('========== Synchronizing ==========');

        // Disable filmstrip on the right.
        _jitsi.executeCommand("toggleFilmStrip");
        // Chat is disabled during sync
        if (chat_box_toggled) {
            _jitsi.executeCommand("toggleChat");
        }
        _jitsi.removeListener("toolbarButtonClicked", watchedChat);
        _jitsi.addListener("toolbarButtonClicked", disableChat);

        procedure.sync();
    }).catch(err => console.error(err.name + ": " + err.message));
}

function onCalibrationEnd() {
    console.log('Gaze Calibration Complete.');
    if (shareCogInfo && total > 0) {
        openModal('facial-expression-instruction-modal');
    } else {
        procedure.calibrateExpCollector(false);
    }
}

function onCameraSelection() {
    closeModal("camera-modal");
    openModal("before-lecture-modal");

    const settings = {
        environment: "development",
        shareGazeInfo: shareGazeInfo,
        shareCogInfo: shareCogInfo,
        gazeEstimatorName: gazeEstimatorName,
        facialExpCollectorName: facialExpCollectorName,
        visualizerNames: visualizerNames,
        confusionReporterName: confusionReporterName,
    }, configurations = {
        gazeEstimatorConfig: {onResult: gazeVisualize, onCalibrationEnd},
        expressionCollectorConfig: {
            total, onCollectEnd, constraint: {
                width: {ideal: 4096},
                height: {ideal: 2160},
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

    setUpClickHandler(procedure);
    calibrationCountDown(procedure);
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
        collectElement = document.getElementById('collect_canvas'),
        collectCtx = collectElement.getContext('2d');

    let camera = new Camera(videoElement, {
        onFrame: () => {
            collectCtx.drawImage(videoElement, 0, 0, collectElement.width, collectElement.height);
        },
        width: 320,
        height: 180,
        deviceId: cameraId,
    });

    let dataManager = dataManagerFactory(userInfo.identity);

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

    return new StudentProcedure(
        gazeEstimator, expressionCollector, inattentionReporter, mouseEventListener, syncProcedure
    );
}

function setUpClickHandler(procedure) {
    let buttonList = [
        "before-lecture-modal-close-btn",
        "calibrate-modal-close-btn",
        "calibrate-modal-btn",
        "facial-expression-instruction-modal-close-btn",
        "facial-expression-instruction-modal-btn",
        "facial-expression-collection-modal-close-btn",
        "facial-expression-collection-modal-btn"
    ];

    let callbackList = [
        () => {
            closeModal('before-lecture-modal');
            if (!SOCKET) {
                openModal('calibrate-modal');
            }
        },
        () => {
            closeModal('calibrate-modal');
            if (facialExpCollectorName === "svm") {
                openModal('facial-expression-instruction-modal');
            } else {
                procedure.calibrateExpCollector(false);
            }
        },
        () => {
            closeModal('calibrate-modal');
            procedure.calibrateGazeEstimator();
        },
        () => {
            closeModal('facial-expression-instruction-modal');
            procedure.calibrateExpCollector(true);
        },
        () => {
            closeModal('facial-expression-instruction-modal');
            openModal('facial-expression-collection-modal');
            procedure.expressionCollector.start();
        },
        () => {
            closeModal('facial-expression-collection-modal');
            procedure.calibrateExpCollector(true);
        },
        () => {
            procedure.calibrateExpCollector(false);
        }
    ]

    buttonList.forEach((buttonName, index) => {
        document.getElementById(buttonName).addEventListener("click", callbackList[index]);
    })
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
        _jitsi.removeListener("toolbarButtonClicked", disableChat);
        _jitsi.addListener("toolbarButtonClicked", watchedChat);
        procedure.end();
    });

    return s
}

/**
 * Listens if the Jitsi chat box is enabled or not.
 * @param e: event emitted from the Jitsi UI. See {@link https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/#toolbarbuttonclicked}.
 */
function watchedChat(e) {
    if (e.key === "chat") {
        // chat box is clicked
        // chat_box_toggled = !chat_box_toggled;
        // console.debug(`Chat button is clicked. Current chat status: ${chat_box_toggled ? "on" : "off"}`);
        _jitsi.executeCommand("toggleChat");
    }
}

/**
 * Disables the Jitsi chat box by taking over control of the chat box.
 * @param e: event emitted from the Jitsi UI. See {@link https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/#toolbarbuttonclicked}. */
function disableChat(e) {
    if (e.key === "chat") {
        // chat box is clicked
        console.debug("Chat is temporarily disabled.");
    }
}

/**
 * Listens if the Jitsi chat box is enabled or not.
 * @param {Object} e event emitted when the status of chat is changed.
 * See {@link https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/#chatupdated}
 * @param {boolean} e.isOpen Whether the chat panel is open or not
 * @param {number} e.unreadCount The unread messages counter
 */
function chatListener(e) {
    chat_box_toggled = e.isOpen;
    console.debug(`Chat status changed. Current chat status: ${chat_box_toggled ? "on" : "off"}, Unread Msgs ${e.unreadCount}`);
}