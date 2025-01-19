const fs = require('fs');
const path = require('path');
const winston = require('winston');
const http = require("http");

const {config, regInfoFilenames, groupId2Setting} = require("./globalSetting");

/**
 * A lecture.
 * @typedef {Object} Lecture
 * @property {string} title Lecture title.
 * @property {string} abstract A brief description of the lecture.
 * @property {string} instructor The name of the instructor.
 * @property {number} time A timestamp indicating the start time of lecture.
 * @property {number} lectureId The identifier of the lecture. An integer.
 * @property {number} groupId The identifier of the group attending.
 */

/**
 * A talk (recorded lectures).
 * @typedef {Object} Talk
 * @property {string} title Talk title.
 * @property {string} abstract A brief description of the talk.
 * @property {string} instructor The name of the instructor.
 * @property {number} duration The duration of the lecture. In minutes.
 * @property {number} talkId The identifier of the talk. An integer.
 * @property {boolean} availability Whether the talk is released to participants.
 */

/**
 * The setting of an experiment session.
 * @typedef {Object} Setting
 * @property {boolean} shareGazeInfo Indicates whether gaze info is shared.
 * @property {boolean} shareCogInfo Indicates whether cognitive info is shared.
 * @property {string} gazeEstimatorName A lower-case string specifies the gaze estimator to use.
 * Valid options: "gazecloud", "webgazer", "random", "none"
 * @property {string} facialExpCollectorName A lower-case string specifies the facial exp collector to use.
 * Valid options: "svm", "random", "none"
 * @property {string} screenCapturerName A lower-case string specifies how to capture screenshot.
 * Valid options: "screensharing", "canvas", "video", "none"
 * @property {string|string[]} visualizerNames A lower-case string or a list of lower-case strings
 * specifies the visualizer(s) to use.
 * Valid options: "aoi", "aoi-monochrome", "aoi-interactive", "aoi-interactive-monochrome",
 * "cogbar", "action", "none"
 * @property {string} confusionReporterName A lower-case string specifies how students report confusion.
 * Valid options: "aoi", "button", "random", "none"
 */

/**
 * The identification information of a student.
 * @typedef {Object} Student
 * @property {number} studentId Identification number of a students.
 * @property {number} groupId Group assignment.
 */

/**
 * Class representing one experiment session / lecture.
 */
class Trial {
    /**
     * Create a representation of one experiment session / trial.
     * @param {Lecture} lecture Information of the lecture itself.
     * @param {Setting} setting Information of the experiment setting.
     */
    constructor(lecture, setting) {
        this.lecture = lecture;
        this.setting = setting === undefined ? defaultTrialSetting : setting;
    }

    /**
     * Update current trial with given information.
     * @param info New trial information.
     * @param {Lecture} info.lecture Updated information of the lecture itself.
     * @param {Setting} info.setting Updated information of the experiment setting.
     */
    updateTrialInfo(info) {
        this.lecture = info.lecture;
        this.setting = info.setting;
    }
}

const errorPage = (code, message) => `<head>
    <title>Something's wrong!</title>
    <meta charset="utf-8"/>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.0/dist/css/bootstrap.min.css" rel="stylesheet"
          integrity="sha384-gH2yIJqKdNHPEq0n4Mqa/HGKIhSkIHeL5AyhkYV8i59U5AR6csBvApHHNl/vI1Bx" crossorigin="anonymous">
    <style type="text/css">
          .box {
            display: flex;
            align-items: center;
            justify-content: center;
          }
    </style>
    </head>
    <body>
    
    <div class="d-flex align-items-center justify-content-center vh-100">
        <div class="text-center">
            <h1 class="display-1 fw-bold">${code}</h1>
            <p class="fs-3">
                ${message}
              </p>
            <a href="/index.html" class="btn btn-primary">Go Home</a>
        </div>
    </div>
    
    </body>
`;

function getRequestLogFormatter() {
    const {combine, timestamp, printf} = winston.format;

    return combine(
        timestamp(),
        printf(info => {
            return `[${info.timestamp}] [${info.level.toUpperCase()}]: ${info.message}`;
        })
    );
}

function getLogFilename(servername) {
    const dedicated = servername.toLowerCase().indexOf('d') >= 0;

    const today = new Date();
    const logpath = path.join(config.FILEPATH, 'logs', `${today.getFullYear()}-${today.getMonth() + 1 < 10 ? '0' + (today.getMonth() + 1) : today.getMonth() + 1}-${today.getDate() < 10 ? '0' + today.getDate() : today.getDate()}`);
    let count = 0;

    if (!fs.existsSync(logpath)) {
        fs.mkdir(logpath,
            {recursive: true},
            (err) => {
                if (err) throw err;
            });
    } else {
        fs.readdirSync(logpath).forEach(file => {
            // is js log file?
            if (file.endsWith('log') && file.toLowerCase().indexOf('js') >= 0) {
                if (dedicated) {
                    // filename contains d from dedicated
                    if (file.toLowerCase().indexOf('d') >= 0) ++count;
                } else {
                    // filename does not contain d
                    if (file.toLowerCase().indexOf('d') < 0) ++count;
                }
            }
        });
    }

    return path.join(logpath, `${dedicated ? 'dedicated-' : ''}js-${count}.log`);
}

/**
 * Read registered information from a local file.
 * @param filename The filename of the registered information.
 * Valid name ends with: "registeredTrials.json", "registeredStudents.json", "registeredTalks.json"
 * @returns {Promise<Trial[]|Map<string, Student>|Talk[]>}
 */
function readRegisteredInfo(filename) {
    return new Promise((resolve, reject) => {
        fs.readFile(filename, 'utf-8', (err, data) => {
            if (err) {
                reject(err);
            } else {
                let parser;
                const info = path.basename(filename).split(".")[0];
                switch (info) {
                    case "registeredTrials":
                        parser = parseTrials;
                        break;
                    case "registeredStudents":
                        parser = parseUsers;
                        break;
                    case "registeredTalks":
                    case "talkHistory":
                    case "suspension":
                    default:
                        parser = JSON.parse;
                }
                resolve(parser(data));
            }
        });
    });
}

/**
 * Read registered information from a remote server.
 * @deprecated This is not used now as file sharing is replaced with a NFS server.
 * @param filename The filename of the registered information to request.
 * Valid name ends with: "registeredTrials.json", "registeredStudents.json", "registeredTalks.json"
 * @param lasttime The timestamp when the requested file is last modified.
 * @param clusterIP The IP address of the remote server that hosts the file.
 * @returns {Promise<{lasttime: *, parsedData: Trial[]}>}
 */
function readRegisteredInfoByRequest(filename, lasttime, clusterIP) {
    return requestFiles(filename, lasttime, clusterIP).then(
        (data) => {
            let parser;
            const info = path.basename(filename).split(".")[0];
            switch (info) {
                case "registeredTrials":
                    parser = parseTrials;
                    break;
                case "registeredStudents":
                    parser = parseUsers;
                    break;
                case "registeredTalks":
                case "talkHistory":
                default:
                    parser = JSON.parse;
            }
            return {
                parsedData: parser(data.content),
                lasttime: data.lasttime,
            }
        }
    )
}

/**
 * Request a file form a remote server specified by clusterIP.
 * @deprecated This is not used now as file sharing is replaced with a NFS server.
 * @param filename The filename to request.
 * @param lasttime The timestamp when the requested file is last modified.
 * @param clusterIP The IP address of the remote server that hosts the file.
 * @returns {Promise<Object>} Parsed data containing 1) lasttime and 2) content
 */
function requestFiles(filename, lasttime, clusterIP) {
    const endpoint = 'http://' + clusterIP + `/service/${filename}/${lasttime}`;

    return new Promise((resolve, reject) => {
        const file_req = http.get(endpoint,
            (res) => {
                /**
                 * Response has two fields: lasttime, content
                 */
                logger.info(`STATUS: ${res.statusCode}`);
                // logger.info(`HEADERS: ${JSON.stringify(res.headers)}`);

                res.setEncoding('utf8');
                let rawData = '';
                res.on('data', (chunk) => {
                    rawData += chunk;
                });

                res.on('end', () => {
                    try {
                        // access from the outer scope. provided by the caller.
                        // contains 2 keys: content, lasttime
                        const parsedData = JSON.parse(rawData);
                        resolve(parsedData)
                    } catch (e) {
                        reject(`Got an error in parsing the response of ${filename} from ${clusterIP}: ${e.message}`);
                    }
                });
            }).on('error', (e) => {
            reject(`Got an error in requesting file ${filename} from ${clusterIP}: ${e.message}`);
        });
    })
}

/**
 * Parse a given JSON string to a map with students names as keys, and student identification info as values.
 * @param data A JSON string read from `registeredStudents.json`
 * @returns {Map<string, Student>} A map with students names as keys,
 * and an object with fields `studentId` and `groupId` as values.
 */
function parseUsers(data) {
    let users = new Map(); // Student Name => {studentId, groupId}, which is the order of student
    let nameList = JSON.parse(data);
    nameList.forEach((item, index) => {
        const userData = {
            ...item
        }
        if (!item.studentId) {
            userData.studentId = index;
        }
        users.set([item.firstName, item.lastName].join(' '), userData);
    });
    return users
}

/**
 * Parse a given JSON string to a list of valid trials from (current - 30min) to future.
 * @param data A JSON string read from `registeredTrials.json`
 * @returns {Trial[]} A list of valid trials.
 */
function parseTrials(data) {
    const gracePeriod = 30 * 60 * 1000; // 30min
    let trials = [];
    let lectureList = JSON.parse(data);
    let current = new Date().getTime() - gracePeriod;
    lectureList.forEach((item) => {
        if (item.lecture.time <= current) return;
        trials.push(new Trial(item.lecture, groupId2Setting(item.lecture.groupId)));
    });
    return trials
}

/**
 * Handling the file read/write requests from JavaScript servers.
 * @deprecated
 * @param logger
 * @param lastModifiedTimes
 * @param registeredInfo
 * @returns {(function(*, *): void)|*}
 */
function readFileFactory(logger, lastModifiedTimes, registeredInfo) {
    return function (req, res) {
        const infoname = req.params["infoname"], // registeredStudents / registeredTrials
            lasttime = req.params["lasttime"];

        if (lastModifiedTimes[infoname] === lasttime) {
            // The file requested has not been modified since last request
            res.send(`File ${infoname} not changed since last requested.`)
        } else {
            // The file requested has been modified since last request. need to read the file
            updateInfoFactory(infoname).then((msg) => {
                if (msg.includes("No change")) {
                    res.statusCode(200).json(
                        {
                            lasttime,
                            content: "",
                        }
                    );
                } else {
                    res.statusCode(200).json(
                        {
                            lasttime: lastModifiedTimes[infoname],
                            content: registeredInfo[infoname],
                        }
                    );
                }
            }).catch(err => {
                logger.error(`An error occurs when reading file ${infoname}: ${err.message}`);
                res.status(500).json({error: err.message})
            })
        }
    }
}

/**
 *
 * @param logger
 * @param lastModifiedTimes
 * @param registeredInfo
 * @returns {function(*): (Promise<string>)}
 */
function updateInfoFactory(logger, lastModifiedTimes, registeredInfo) {
    return function (infoname) {
        // logger.debug(`Updating ${infoname} list.`);

        const stats = fs.statSync(regInfoFilenames[infoname]);
        // if (stats.mtimeMs === lastModifiedTimes[infoname]) {
        //     // File not modified. Skip.
        //     logger.info("No change since last update.");
        //     return Promise.resolve("No change since last update.")
        // }

        // File has been modified
        lastModifiedTimes[infoname] = stats.mtimeMs;
        return readRegisteredInfo(regInfoFilenames[infoname]).then((data) => {
            const previousSize = registeredInfo[infoname].length === undefined ?
                    registeredInfo[infoname].size : registeredInfo[infoname].length,
                newSize = data.length === undefined ? data.size : data.length;

            if (newSize !== previousSize) {
                registeredInfo[infoname] = data;
                logger.info(`${infoname} list updated. Previous ${previousSize} entries, now ${newSize} entries.`);
                return `${infoname} list updated.`
            } else {
                // Size is the same. Need to check each element.
                let sameFlag;
                if (infoname === "registeredTrials") {
                    sameFlag = isSameTrials(registeredInfo[infoname], data, logger);
                } else if (infoname === "registeredStudents") {
                    sameFlag = isSameStudents(registeredInfo[infoname], data, logger);
                } else if (infoname === "registeredTalks") {
                    sameFlag = isSameTalk(registeredInfo[infoname], data, logger);
                } else {
                    sameFlag = true;
                }

                if (!sameFlag) {
                    registeredInfo[infoname] = data;
                    logger.info(`${infoname} list updated. Previous ${previousSize} entries, now ${newSize} entries.`);
                    return `${infoname} list updated.`
                } else {
                    // logger.info("No change since last update.");
                    return "No change since last update."
                }
            }
        })
    }
}

function isSameTrials(trialListA, trialListB, logger) {
    for (let i = 0; i < trialListA.length; i++) {
        const a = trialListA[i], b = trialListB[i];
        // Check Lecture info
        const aL = a["lecture"], bL = b["lecture"];
        for (let k of Object.keys(aL)) {
            if (aL[k] !== bL[k]) {
                logger.info(`Trial lecture ${k} is changed ${aL[k]} -> ${bL[k]}`)
                return false
            }
        }
        // Check Setting info
        const aS = a["setting"], bS = b["setting"];
        for (let k of Object.keys(aS)) {
            if (k === "visualizerNames") {
                if (aS[k].length !== bS[k].length) {
                    logger.info(`Trial setting ${k} is changed ${aS[k]} -> ${bS[k]}`)
                    return false
                }
                for (let j = 0; j < aS[k].length; j++) {
                    if (aS[k][j] !== bS[k][j]) {
                        logger.info(`Trial setting ${k} is changed ${aS[k]} -> ${bS[k]}`)
                        return false
                    }
                }
            } else if (aS[k] !== bS[k]) {
                logger.info(`Trial setting ${k} is changed ${aS[k]} -> ${bS[k]}`)
                return false
            }
        }
    }
    return true
}

function isSameStudents(mapA, mapB, logger) {
    for (let [k, studentA] of mapA) {
        if (!mapB.has(k)) return false

        const studentB = mapB.get(k);
        for (let [student_k, student_v] of Object.entries(studentA)) {
            if (studentB[student_k] !== student_v) {
                logger.info(`Student ${k} info ${student_k} is changed ${studentB[student_k]} -> ${student_v}`)
                return false
            }
        }
    }
    return true
}

function isSameTalk(talkListA, talkListB, logger) {
    for (let i = 0; i < talkListA.length; i++) {
        const a = talkListA[i], b = talkListB[i];
        for (let k of Object.keys(a)) {
            if (a[k] !== b[k]) {
                logger.info(`Talk ${k} is changed ${a[k]} -> ${b[k]}`)
                return false
            }
        }
    }
    return true
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getTalkViews(talkHistory) {
    const talkViews = {},
        allTalks = [];

    for (let key of Object.keys(talkHistory)) {
        if (key.includes("talk")) talkViews[key] = 0;
        allTalks.append(key);
    }

    talkHistory.forEach((userHistory) => {
        for (let key of Object.keys(talkHistory)) {
            talkViews[key] += 1;
        }
    })

    return allTalks
}

// Exports
exports.Trial = Trial;
exports.errorHandler = function (logger) {
    return function (err, req, res, next) {
        logger.info("Error handled: " + err.message);
        res.status(err.statusCode).send(errorPage(err.statusCode, err.message));
    }
}
exports.getLogger = function (servername) {
    return winston.createLogger({
        format: getRequestLogFormatter(),
        transports: [
            new winston.transports.Console(),
            new winston.transports.File({filename: getLogFilename(servername)})
        ]
    });
}
exports.sleep = sleep;
exports.getTalkViews = getTalkViews;

// managing reading and updating registered info
if (config.ReadFilesFrom === "local") {
    exports.readRegisteredInfo = readRegisteredInfo;
} else {
    exports.readRegisteredInfo = readRegisteredInfoByRequest;
}
exports.updateInfoFactory = updateInfoFactory;

