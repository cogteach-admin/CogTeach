import TeacherProcedure from "./modules/teacherProcedure.js";
import dataManagerFactory from "./modules/DataManager.js";
import screenCapturerFactory from "./modules/dataGenerators/ScreenCapturer.js";
import syncProcedureFactory from "./modules/teacherSyncProcedure.js";

document.addEventListener("DOMContentLoaded", () => openModal("before-lecture-modal"));

let procedure;
let socket;

/**
 * The whole procedure would be:
 * window.onload (init settings/socket/jitsi) =>
 * prepare() (blocking, calibrate screenshot capturer if needed) =>
 * [SOCKET TAKES CONTROL HERE] Normal callback is replaced below.
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

    // Set up the Jitsi meeting
    const config = {
        startWithAudioMuted: true,
        disablePolls: true,
    }
    await initialiseJitsi(config);

    let containerRect = document.getElementById("container").getBoundingClientRect();
    maxH = containerRect.height;
    maxW = containerRect.width;
    cog_width = 0.5*maxW;
    cog_height = 0.1*maxH;

    const settings = {
        environment: "development",
        shareGazeInfo: shareGazeInfo,
        shareCogInfo: shareCogInfo,
        screenCapturerName: screenCapturerName,
        visualizerNames: visualizerNames,
    }, configurations = {
        screenCapturerConfig: {
            screenSharingConfig: {video: {cursor: "never", displaySurface: "application"}, audio: false},
            onCalibrateEnd: SOCKET ? ()=>{} : onCalibrateEnd,
        },
        AoIConfig: {animationTime},
        cogBarConfig: {margin, xOffset:cog_width, yOffset:"2%", cog_width, cog_height, animationTime},
        actionConfig: {margin, xOffset:cog_width, yOffset:0, act_width: cog_width, act_height: cog_height, animationTime}
    };

    setUpClickHandler();
    procedure = procedureFactory(settings, configurations);
    window.procedure = procedure;
    prepare(settings, configurations);
}

function prepare(settings, configurations) {
    console.log('========== Preparing ==========');
    procedure.init();

    if (lectureInfo === null) {
        document.getElementById("before-lecture-modal-description").innerText = 'No upcoming lecture. Please be back later.';
        return
    }

    hold(
        lectureInfo.lecture.time - hms2timestamp(0, 10, 0),
        delay => {
            document.getElementById("before-lecture-modal-description")
                .innerText = timeFormatter(delay + hms2timestamp(0, 10, 0));
        },
        1000
    ).then(() => {
        closeModal('before-lecture-modal');
        if (screenCapturerName === "ScreenSharingCapturer") {
            // Safari: Screen sharing must be triggered by user interaction.
            openModal("screen-sharing-modal");
            // procedure.calibrateScreenCapturer() will be called from btn.
        } else {
            procedure.calibrateScreenCapturer();
        }
    }).catch(err => console.error(err));
}

function onCalibrateEnd() {
    hold(
        lectureInfo.lecture.time,
        ()=>{},
        1000
    ).then(()=>{
        console.log('========== Synchronizing ==========');
        procedure.sync();
    }).catch(err => console.error(err));
}

function setUpClickHandler() {
    let buttonList = [
        "before-lecture-modal-close-btn",
        "screen-sharing-modal-close-btn",
        "screen-sharing-modal-btn",
    ];

    let callbackList = [
        () => {
            closeModal('before-lecture-modal');
            if (screenCapturerName === "ScreenSharingCapturer") {
                // Safari: Screen sharing must be triggered by user interaction.
                openModal("screen-sharing-modal");
                // procedure.calibrateScreenCapturer() will be called from btn.
            } else {
                procedure.calibrateScreenCapturer();
            }
        },
        () => {
            closeModal("screen-sharing-modal");
        },
        () => {
            closeModal("screen-sharing-modal");
            procedure.calibrateScreenCapturer();
        }
    ]

    buttonList.forEach((buttonName, index) => {
        document.getElementById(buttonName).addEventListener("click", callbackList[index]);
    })
}

/**
 * Returns the procedure manager on the teacher's side.
 * @param {object} settings - Settings for this trial.
 * @param {string} settings.environment - The environment.
 * @param {boolean} settings.shareGazeInfo - Specifies if gaze info is shared.
 * @param {boolean} settings.shareCogInfo - Specifies if cognitive info is shared.
 * @param {string} settings.screenCapturerName - Specifies the screen capturer to be used.
 * @param {string|string[]} settings.visualizerNames - Specifies the visualizers to be used.
 * @param {object} configurations - Configurations for each module.
 * @returns {TeacherProcedure}
 */
function procedureFactory(settings, configurations) {
    let dataManager = dataManagerFactory(userInfo.identity),
        screenCapturer = screenCapturerFactory(settings, configurations.screenCapturerConfig, dataManager);

    document.getElementById("get_screenshot").addEventListener("click", screenCapturer.examine)

    dataManager.subscribe(screenCapturer);

    let syncProcedure = syncProcedureFactory(settings, configurations, dataManager);

    return new TeacherProcedure(
        screenCapturer, syncProcedure
    );
}


/**
 * Trigger when we are using socket to manage sync procedure.
 * @returns s - The socket.
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

    s.on("teacher start", () => {
        if (!SYNCING) {
            // Avoids starting the sync procedure too many times.
            onCalibrateEnd();
            SYNCING = true;
        } else {
            console.debug("Start event has already been received,");
        }
    });
    s.on("start", () => {
        if (!SYNCING) {
            // Avoids starting the sync procedure too many times.
            onCalibrateEnd();
            SYNCING = true;
        } else {
            console.debug("Start event has already been received,");
        }
    });
    s.on("end", () => procedure.end());

    return s
}
