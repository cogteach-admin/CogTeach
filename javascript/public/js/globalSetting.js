// Post random gaze or not
const environment = "development";
const RANDOM = false;
/**
 * Specifies whether the gaze information is shared.
 * @type {boolean}
 * @@global
 * */
let shareGazeInfo = true;
/**
 * Specifies whether the cognitive state information is shared.
 * @type {boolean}
 * @global
 * */
let shareCogInfo = true;
/**
 * Specifies the gaze estimator to be used. Ignored if shareGazeInfo = False.
 * Accepted strings are (letter cases are ignored): "gazecloud", "webgazer", "random", "none"
 * @type {string}
 * @global
 * */
let gazeEstimatorName = RANDOM ? "random" : "webgazer";
const gazeEstimatorNameList = ["gazecloud", "webgazer", "random", "none"];
/**
 * Specifies the facial expression collector to be used. Ignored if shareCogInfo = False.
 * Accepted strings are (letter cases are ignored): "svm", "random", "none"
 * @type {string}
 * @global
 * */
let facialExpCollectorName = RANDOM ? "random" : "none";
const facialExpCollectorNameList = ["svm", "pure", "random", "none"];
/**
 * Specifies the screen capturer to be used. Used on the instructor's side.
 * Accepted strings are (letter cases are ignored): "screensharing", "canvas", "video", "none"
 * @type {string}
 * @global
 * */
let screenCapturerName = "video";
const screenCapturerNameList = ["screensharing", "canvas", "video", "none"];
/**
 * Specifies the visualizers to be used. Ignored if shareGazeInfo = False.
 * Accepted strings are (letter cases are ignored):
 * "aoi", "cogbar", "action", "none"
 * For AoI visualizations, they can use "-" to add more configurations.
 * Valid configurations: "monochrome", "interactive", "onchange"
 * @type {string|string[]}
 * @global
 * */
let visualizerNames = ["aoi-interactive", "cogbar"]
const visualizerNameList = ["aoi", "cogbar", "action", "none"];
/**
 * Specifies the confusionReporter to be used. Ignored if shareGazeInfo = False.
 * Accepted strings are (letter cases are ignored): "aoi", "button", "random", "none"
 * @type {string}
 * @global
 * */
let confusionReporterName = RANDOM ? "random" : "none";
const confusionReporterNameList = ["aoi", "button", "random", "none"];
/**
 * Specifies the aoiSource to be used. Used only in async lectures (videos).
 * Accepted strings are (letter cases are ignored): "peer", "expert", "none"
 * @type {string}
 * @global
 */
let aoiSourceName = "none";
const aoiSourceNameList = ["none", "peer", "expert"]
/**
 * A string stating the reason why the user is not allowed to continue.
 * @type {string}
 * @global
 */
let refuse;

// Configurations
const total = 0; // set to be greater than 0 when collecting facial expressions
const inferInterval = 1000; // in micro-second
const updateInterval = 5; // in second
const animationTime = 1000; // in micro-second
const margin = {top: 20, right: 30, bottom: 30, left: 100};
let maxH, maxW, cog_height, cog_width;

const userInfo = JSON.parse(getCookie('userInfo'));
let lectureInfo = localStorage.getItem("lectureInfo");
try {
    lectureInfo = JSON.parse(lectureInfo);
} catch (e) {
    console.warn("Fail to read lecture info: " + e);
}
let cameraId;
let slideId = 0; // the current slide version
// ==============================================================
// Constants (for better code comprehension)
// possible states of variable collecting
const NEUTRAL = 0;
const CONFUSED = 1;
const NOTCALIBRATED = 2;
const READY = 3;
// identity of user
const STUDENT = 1;
const TEACHER = 2;
// distinguish the type of data post to confusion(python) server
const COLLECTION = 0; // data collection state
const INFERENCE = 1; // server should predict confusion status
const INCREMENT = 2; // incremental data collection

// let detector;
// if (typeof EKDetector === 'function') {
//     detector = new EKDetector();
// } else if (typeof EKThresholdDetector === 'function') {
//     detector = new EKThresholdDetector();
// } else {
//     detector = undefined
// }
const SOCKET = true;

/**
 * Denotes whether the system is syncing now.
 * @type {boolean}
 */
let SYNCING = false;
// ==============================================================
// =======================Helper Functions=======================
// ==============================================================

/**
 * Retrieve setting from server
 * @param lectureMode Whether it is sync / async lecture.
 * @returns {Promise<void>}
 */
function fetchSetting(lectureMode) {
    if (lectureMode === "sync") {
        return fetchTrialSetting()
    } else {
        return fetchTalkSetting()
    }
}

async function fetchTrialSetting() {
    let res = await fetch('/admin/trial', {
        method: 'GET',
    });
    let trialInfo = await res.json();

    shareGazeInfo = trialInfo.setting.shareGazeInfo;
    shareCogInfo = trialInfo.setting.shareCogInfo;

    const gename = trialInfo.setting.gazeEstimatorName.toLowerCase(),
        fecname = trialInfo.setting.facialExpCollectorName.toLowerCase().split("-")[0],
        scname = trialInfo.setting.screenCapturerName.toLowerCase(),
        crname = trialInfo.setting.confusionReporterName.toLowerCase();

    if (!gazeEstimatorNameList.includes(gename)) {
        console.warn(`Specified gaze estimator (${gename}) is invalid. Will use default ${gazeEstimatorName}.`);
    } else {
        gazeEstimatorName = RANDOM ? "random" : gename;
    }

    if (!facialExpCollectorNameList.includes(fecname)) {
        console.warn(`Specified facial expression collector (${fecname}) is invalid. Will use default ${facialExpCollectorName}.`);
    } else {
        facialExpCollectorName = RANDOM ? "random" : fecname;
    }

    if (!screenCapturerNameList.includes(scname)) {
        console.warn(`Specified screen capturer (${scname}) is invalid. Will use default ${screenCapturerName}.`);
    } else {
        screenCapturerName = scname;
    }

    if (typeof (trialInfo.setting.visualizerNames) === "string") {
        const vname = trialInfo.setting.visualizerNames.toLowerCase();
        if (!visualizerNameList.includes(vname.split("-")[0])) {
            console.warn(`Specified visualizer (${vname}) is invalid. Will use default ${visualizerNames}.`);
        } else {
            visualizerNames = [vname];
        }
    } else {
        // An array of strings
        const vnames = trialInfo.setting.visualizerNames.map(name => name.toLowerCase());
        if (!vnames.every(vname => visualizerNameList.includes(vname.split("-")[0]))) {
            console.warn(`Some specified visualizers (${vnames}) are invalid. Will use default ${visualizerNames}.`);
        } else {
            visualizerNames = [...new Set(vnames)];
        }
    }

    if (!confusionReporterNameList.includes(crname)) {
        console.warn(`Specified confusion reporter (${crname}) is invalid. Will use default ${confusionReporterNameList}.`);
    } else {
        if (crname === "aoi" && !visualizerNames.some(vname => vname.includes("aoi"))) {
            // the confusion reporter is set to be aoi-based but the visualizer is set to be something not aoi.
            // this happens for the control group and the treatment group that shows the global information
            visualizerNames.push("aoi-interactive-monochrome");
        }
        confusionReporterName = crname;
    }

    console.log("Trial setting fetched successfully.");
}

// Retrieve setting from server
async function fetchTalkSetting() {
    // user information is posted to the server by cookie
    // the selected talk information is posted as well
    if (!localStorage.getItem("talkId")) {
        refuse = "You have reached this page without selecting the correct lecture.";
        return
    }

    // receives the setting of current talk, and the link to video;
    let res = await fetch('/workshop/view_numbers', {
        method: 'POST',
        body: JSON.stringify({
            talkId: localStorage.getItem("talkId"),
            userInfo: userInfo,
        })
    });
    let talkInfo = await res.json();

    const setting = talkInfo.setting;
    refuse = talkInfo.refuse;

    shareGazeInfo = setting.shareGazeInfo;
    shareCogInfo = setting.shareCogInfo;
    gazeEstimatorName = setting.gazeEstimatorName;
    facialExpCollectorName = setting.facialExpCollectorName;
    visualizerNames = (typeof (setting.visualizerNames) === "string") ? [setting.visualizerNames] : setting.visualizerNames;
    confusionReporterName = setting.confusionReporterName;
    // TODO: implement aoi sources
    aoiSourceName = setting.aoiSource;

    console.log("Talk setting fetched successfully.");
}

function displayTrialSetting() {
    console.log(`Gaze: ${shareGazeInfo ? 'On' : 'Off'}, Cog: ${shareCogInfo ? 'On' : 'Off'}.`);
    console.log(`Gaze estimator: ${gazeEstimatorName}`);
    console.log(`Facial expression collector: ${facialExpCollectorName}`);
    console.log(`Screen capturer: ${screenCapturerName}`);
    console.log(`Visualizer names: ${visualizerNames}`);
    console.log(`Confusion reporter names: ${confusionReporterName}`);
    console.log(`AoI source name (used only in async lectures): ${aoiSourceName}`);
}

// ==============================================================
// Initialize Jitsi
/**
 * Jitsi iframe API. See {@link https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe}
 */
let _jitsi;

let chat_box_toggled = false;

const loadJitsiScript = () => {
    let resolveLoadJitsiScriptPromise = null;
    const loadJitsiScriptPromise = new Promise((resolve) => {
        resolveLoadJitsiScriptPromise = resolve;
    });

    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.onload = resolveLoadJitsiScriptPromise;
    document.body.appendChild(script);
    return loadJitsiScriptPromise;
};

const initialiseJitsi = async (config) => {
    console.log('jitsi initialize started');
    if (!window.JitsiMeetExternalAPI) {
        await loadJitsiScript();
    }

    const options = {
        roomName: "shenzilinmeeting",
        width: "100%",
        height: "90%",
        parentNode: document.getElementById("container"),
        lang: 'en',
        bottom: 0,
        configOverwrite: config,
        userInfo: {
            displayName: titleCase(userInfo.name),
        },
        interfaceConfigOverwrite: {
            SHOW_CHROME_EXTENSION_BANNER: false,
        }
    }

    _jitsi = new window.JitsiMeetExternalAPI("meet.jit.si", options);

    console.log('jitsi initialize end');
}

// ==============================================================
// Counting down manager
function hold(scheduleTime, update, updateInterval) {
    return new Promise(function (resolve, reject) {
        let countdown = setInterval(() => {
            let delay = scheduleTime - Date.now();

            // countdown is over
            if (delay <= 0) {
                clearInterval(countdown);
                resolve("Blockage done.");
            }

            update(delay);
        }, updateInterval);
    })
}

// ==============================================================
// Modal window operations
function openModal(modalId) {
    // document.getElementById("backdrop").style.display = "block"
    document.getElementById(modalId).style.display = "block"
    document.getElementById(modalId).className = document.getElementById(modalId).className.replace("fade", "show")
}

function closeModal(modalId) {
    // document.getElementById("backdrop").style.display = "none"
    document.getElementById(modalId).style.display = "none"
    document.getElementById(modalId).className = document.getElementById(modalId).className.replace("show", "fade")
}

// ==============================================================
// Cookie handler
function getCookie(name) {
    let matches = document.cookie.match(new RegExp(
        "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
    ));
    return matches ? decodeURIComponent(matches[1]) : undefined;
}

// ==============================================================
// Time format converter
function timestamp2hms(ts) {
    ts = ts / 1000; // in seconds
    let seconds = Math.floor(ts) % 60;
    ts = (ts - seconds) / 60; // in minutes
    let minutes = Math.floor(ts) % 60;
    ts = (ts - minutes) / 60; // in hours
    let hours = Math.floor(ts);
    return [hours, minutes, seconds];
}

function hms2timestamp(h, m, s) {
    return (s + m * 60 + h * 3600) * 1000
}

function timeFormatter(timestamp) {
    let [h, m, s] = timestamp2hms(timestamp);
    return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
}

// ==============================================================
// Enable/disable plotting_svg
function change_svg_visibility(e, svg_id) {
    let svg = document.getElementById(svg_id);

    if (svg === null) {
        console.warn(`Specified ${svg_id} is not found.`);
    } else {
        const disp = svg.style.display;

        if (disp === "none") {
            // is hidden now
            svg.style.display = "block";
            e.target.value = "Enable buttons";
        } else {
            // is visible now
            svg.style.display = "none";
            e.target.value = "Enable SVG";
        }
    }
}

/**
 * Capitalize the first letter of each word in a sentence.
 * @param {string} str The sentence to be capitalized.
 * @returns {string} The capitalized string.
 */
function titleCase(str) {
   let splitStr = str.toLowerCase().split(' ');
   for (let i = 0; i < splitStr.length; i++) {
       // You do not need to check if i is larger than splitStr length, as your for does that for you
       // Assign it back to the array
       splitStr[i] = splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1);
   }
   // Directly return the joined string
   return splitStr.join(' ');
}


// ==============================================================
// Camera Selection
// It seems that the user needs to first set the default camera in their browser first…
// The camera selection only enforces the new Camera()
// rather than the GazeCloud, which seems to use the default one.
function selectCamera(onSelection) {
    const cameraModalName = "camera-modal";
    const description = document.getElementById("camera-description-1");
    const selectionVideo = document.getElementById("camera-selection-video");

    if (!navigator.mediaDevices.enumerateDevices) {
        onSelection();
        return
    }

    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            devices = devices.filter(device => device.kind === 'videoinput');

            switch (devices.length) {
                case 0:
                    description.innerText = 'No camera available. Please check your device connection.';
                    onSelection();
                    break;
                case 1:
                    cameraId = devices[0].deviceId;
                    onSelection();
                    break;
                default:
                    // More than one camera
                    description.innerText = 'Please choose the camera you would like to use.';

                    let btn = document.getElementById("camera-btn");
                    btn.onclick = event => {
                        cameraId = +Array.from(document.querySelectorAll("input[className='form-check-input']"))
                            .filter(radio => radio.checked)[0]
                            .id.slice(-1);
                        cameraId = devices[cameraId].deviceId;
                        navigator.mediaDevices.getUserMedia({video: {deviceId: cameraId}});

                        // clean up the selection video
                        selectionVideo.pause();
                        selectionVideo.remove();

                        onSelection();
                    }

                    devices.forEach((device, i) => {
                        let radio = document.createElement('div');
                        radio.classList.add('form-check');
                        radio.innerHTML =
                            `<input className="form-check-input" type="radio" name="camera" id="cameraRadio${i}">
                        <label className="form-check-label" htmlFor="cameraRadio${i}">
                        ${device.label ? device.label : "Camera " + (i + 1)}</label>`;
                        description.insertAdjacentElement('beforeend', radio);
                    });

                    let radioList = document.querySelectorAll("[id^=cameraRadio]");
                    radioList.forEach((radio, index) => {
                        if (index === 0) {
                            navigator.mediaDevices.getUserMedia(
                                {video: {deviceId: devices[index].deviceId}}
                            ).then((s) => {
                                selectionVideo.srcObject = s;
                                selectionVideo.style.display = "block";
                                selectionVideo.play();
                            });
                            radio.checked = true;
                        }
                        radio.onchange = (e) => {
                            navigator.mediaDevices.getUserMedia(
                                {video: {deviceId: devices[index].deviceId}}
                            ).then((s) => {
                                selectionVideo.srcObject = s;
                                selectionVideo.play();
                            });
                        }
                    })
            }
        })
        .catch(function (err) {
            console.error(err.name + ": " + err.message);
        });
}
