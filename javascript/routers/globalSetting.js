const path = require("path");
const config = {
    FILEPATH: (process.env.NODE_ENV || "development") === "development" ?
        'REPLACE_WITH_YOUR_OWN_FILE_STORAGE_PATH' : '/mnt/fileserver',
    DNSServerIP: '',
    nodeEnv: process.env.NODE_ENV || "development",
    ReadFilesFrom: "local", // decides where read from local disk for from a server.
    // ReadFilesFrom: "server",
    PORT: process.env.PORT || 5000,
}

// identity of user
const identities = {
    STUDENT: 1,
    TEACHER: 2,
    ADMIN: 3,
}

const lectureMode = "async";

const regInfoFilenames = {
    registeredStudents: path.join(config.FILEPATH, 'registeredInfo', 'registeredStudents.json'),
    registeredTrials: path.join(config.FILEPATH, 'registeredInfo', 'registeredTrials.json'),
    registeredTalks: path.join(config.FILEPATH, 'registeredInfo', 'registeredTalks.json'),
    // talkHistory: path.join(config.FILEPATH, 'registeredInfo', 'talkHistory.json'),
    suspension: path.join(config.FILEPATH, 'registeredInfo', 'suspension.json'),
}, regInfoUpdateInterval = {
    registeredStudents: 5 * 60 * 1000,
    registeredTrials: 5 * 60 * 1000,
    registeredTalks: 5 * 60 * 1000,
    // talkHistory: -1,
    // check every hour
    suspension: 5 * 60 * 1000,
}

const defaultTrialSetting = {
    "shareGazeInfo": true,
    "shareCogInfo": true,
    "gazeEstimatorName": "gazecloud",
    "facialExpCollectorName": "none",
    "screenCapturerName": "screensharing",
    "visualizerNames": ["interactiveAoI", "cogbar"],
    "confusionReporterName": "aoi"
}


/**
 * Pre-set experiment settings for sync lectures.
 */
const BUTTON_CONTROL = {
        shareGazeInfo: true,
        shareCogInfo: true,
        gazeEstimatorName: "webgazer",
        facialExpCollectorName: "none",
        screenCapturerName: "none",
        visualizerNames: "none",
        confusionReporterName: "button",
    },
    CONTROL = {
        shareGazeInfo: true,
        shareCogInfo: true,
        gazeEstimatorName: "webgazer",
        facialExpCollectorName: "none",
        screenCapturerName: "video",
        visualizerNames: "none",
        confusionReporterName: "aoi",
    },
    TREATMENT_GLOBAL = {
        shareGazeInfo: true,
        shareCogInfo: true,
        gazeEstimatorName: "webgazer",
        facialExpCollectorName: "none",
        screenCapturerName: "video",
        visualizerNames: "cogbar",
        confusionReporterName: "aoi",
    },
    TREATMENT_SPATIAL = {
        shareGazeInfo: true,
        shareCogInfo: true,
        gazeEstimatorName: "webgazer",
        facialExpCollectorName: "none",
        screenCapturerName: "video",
        visualizerNames: "aoi-interactive",
        confusionReporterName: "aoi",
    },
    ALL_THE_WAY = {
        shareGazeInfo: true,
        shareCogInfo: true,
        gazeEstimatorName: "webgazer",
        facialExpCollectorName: "none",
        screenCapturerName: "video",
        visualizerNames: ["aoi-interactive", "cogbar"],
        confusionReporterName: "aoi",
    };

/**
 * Pre-set experiment settings for async lectures (recorded videos).
 * not used now. the setting is stored on Python servers.
 * @deprecated
 */
const CONTROL_ASYNC = {
    shareGazeInfo: true,
    shareCogInfo: true,
    gazeEstimatorName: "webgazer",
    facialExpCollectorName: "pure",
    visualizerNames: "none",
    confusionReporterName: "screen",
    aoiSource: "none",
}, TREATMENT_ALWAYS_ON = {
    shareGazeInfo: true,
    shareCogInfo: true,
    gazeEstimatorName: "webgazer",
    facialExpCollectorName: "pure",
    visualizerNames: "aoi",
    confusionReporterName: "screen",
    aoiSource: "peer",
}, TREATMENT_ON_CHANGE = {
    shareGazeInfo: true,
    shareCogInfo: true,
    gazeEstimatorName: "webgazer",
    facialExpCollectorName: "pure",
    visualizerNames: "aoi-on-change",
    confusionReporterName: "screen",
    aoiSource: "peer",
}, TREATMENT_EXPERT = {
    shareGazeInfo: true,
    shareCogInfo: true,
    gazeEstimatorName: "webgazer",
    facialExpCollectorName: "pure",
    visualizerNames: "aoi",
    confusionReporterName: "screen",
    aoiSource: "expert",
};


/**
 * This is used for dynamic creating new users. It decides the groupID.
 * @type {number}
 */
const groupThreshold = 10;

/**
 * The number of accounts that are set in advance for testing.
 * @type {number}
 */
const presetUsers = 7;

const groupId2Setting = (group_id) => {
    if (lectureMode === "sync") {
        switch (group_id) {
            case 0:
                return BUTTON_CONTROL
            case 1:
                return CONTROL
            case 2:
                return TREATMENT_GLOBAL
            case 3:
                return TREATMENT_SPATIAL
            case 4:
            default:
                return ALL_THE_WAY
        }
    } else if (lectureMode === "async") {
        switch (group_id) {
            case 0:
                return CONTROL_ASYNC
            case 1:
                return TREATMENT_ALWAYS_ON
            case 2:
                return TREATMENT_ON_CHANGE
            case 3:
            default:
                return TREATMENT_EXPERT
        }
    }
}

const confirmationCode = [
    {"pre": 1178, "post": 6708},
    {"pre": 4935, "post": 9422},
    {"pre": 2335, "post": 3040},
    {"pre": 6966, "post": 8649},
    {"pre": 5315, "post": 9787},
]

/**
 *
 * @param {string|number} talkId The ID of talk.
 * @param {string} testName Either be pre or post.
 */
const getTestConfirmationCode = function (talkId, testName) {
    talkId = Math.min(+talkId, confirmationCode.length - 1);

    if (testName.includes("pre")) {
        testName = "pre";
    } else if (testName.includes("post")) {
        testName = "post";
    } else {
        testName = "pre";
    }

    return confirmationCode[talkId][testName]
}

const powerFormLinks = {
    child: "https://www.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=5549fe39-6da5-4758-b5b5-6aad4b443b9b&env=na1&acct=6371e373-11ff-4359-aa24-bf2ccbddc944&v=2",
    adolescent: "https://www.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=1cd15124-339f-4770-8e8a-1c0ff03e5e63&env=na1&acct=6371e373-11ff-4359-aa24-bf2ccbddc944&v=2",
    adult: "https://www.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=0c8e1e86-9890-4405-ae38-77f4bd200188&env=na1&acct=6371e373-11ff-4359-aa24-bf2ccbddc944&v=2",
}

// Links before the IRB approved in Oct, 2022.
// powerFormLinks = {
//     child: "https://www.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=7038d5ff-99fe-4a52-883a-8dc9908ee198&env=na1&acct=6371e373-11ff-4359-aa24-bf2ccbddc944&v=2",
//     adolescent: "https://www.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=964d73be-823d-4f5e-8e27-fe54e7ada55d&env=na1&acct=6371e373-11ff-4359-aa24-bf2ccbddc944&v=2",
//     adult: "https://www.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=ef14650e-f1d3-4b8b-99cd-01c2556b7884&env=na1&acct=6371e373-11ff-4359-aa24-bf2ccbddc944&v=2",
// }

/**
 * Returns links to consent forms based on student's age
 * @param {number|string} age The student's age.
 * @returns {*[]} A list of links to consent forms.
 */
const getPowerFormLinks = function (age) {
    age = +age;

    let links = [];
    if (age >= 0 && age <= 12) {
        // child
        links.push({
            formName: "child",
            formLink: powerFormLinks.child,
        })
    } else if (age >= 13 && age <= 17) {
        // adolescent
        links.push({
            formName: "adolescent",
            formLink: powerFormLinks.adolescent,
        })
    } else {
        links.push({
            formName: "adult",
            formLink: powerFormLinks.adult,
        })
    }

    return links
}

/**
 *
 * @param group
 * @returns {string}
 */
const getQuestionnaireLinks = function (group) {
    group = +group;

    switch (group) {
        case 0:
            // control group
            return "https://forms.gle/4fiRojqzvmhUGmX97"
            break
        default:
            return "https://forms.gle/CBHGvMAuYr2jDZsz5"
    }
}

exports.config = config;
exports.identities = identities;
exports.lectureMode = lectureMode;
exports.groupThreshold = groupThreshold;
exports.presetUsers = presetUsers;
exports.regInfoFilenames = regInfoFilenames;
exports.regInfoUpdateInterval = regInfoUpdateInterval;
exports.groupId2Setting = groupId2Setting;
exports.getTestConfirmationCode = getTestConfirmationCode;
exports.getPowerFormLinks = getPowerFormLinks;
exports.getQuestionnaireLinks = getQuestionnaireLinks;
