/**
 *  Registered student name and instructor passcode
 */
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const {config, lectureMode, identities, regInfoFilenames, groupThreshold, presetUsers} = require("./globalSetting"),
    FILEPATH = config.FILEPATH,
    {STUDENT, TEACHER, ADMIN} = identities;

let digestMessage = function (message) {
    return crypto.createHash("sha256").update(message.toString()).digest("hex")
};

const teacherPasscodeHash = digestMessage('cogteacher'),
    adminPasscodeHash = digestMessage('QgaltGBiwMT2StgL');

let studentAuthHash = digestMessage('student'),
    teacherAuthHash = digestMessage('teacher'),
    adminAuthHash = digestMessage('admin');

/**
 * Factory function for generating different user verification middleware.
 * @param identity
 * @returns {(function(*, *, *): (*|undefined))|*}
 */
function verifyUserFactory(identity) {
    return function (req, res, next) {
        if (!req.cookies['userInfo']) { // Cookie is not set.
            let err = new Error('Please login first.');
            err.statusCode = 401;
            return next(err);
        } else {
            let parsedCookie = JSON.parse(req.cookies['userInfo']);

            let authHash;
            if (identity === STUDENT) {
                authHash = studentAuthHash;
            } else if (identity === TEACHER) {
                authHash = teacherAuthHash;
            } else if (identity === ADMIN) {
                authHash = adminAuthHash;
            }

            if (parsedCookie.authcode !== authHash) {
                // Hash of passcode does not pass.
                let err = new Error(`${identity === STUDENT ? 'Student' : 'Instructor'} authentication code mismatch.`);
                err.statusCode = 401;
                return next(err);
            }
        }
        // Authorization code match. Allow to proceed.
        next();
    }
}

/**
 * Login middleware for students/teachers.
 * @param logger
 * @param ts timestamp
 * @param registeredInfo contains the registeredStudents information.
 * Note: can not pass registeredInfo.registeredStudents. Otherwise, changes are not captured.
 * @returns {(function(*, *, *): (*|undefined))|*}
 */
function newUserLogin(logger, ts, registeredInfo) {
    return function (req, res, next) {
        const registeredStudents = registeredInfo.registeredStudents;
        // Creates user directory and generate cookie
        let content = req.body;
        logger.debug('============================')
        logger.debug(content);
        const identity = +content.identity;

        const suspensionInfo = registeredInfo.suspension;
        if (suspensionInfo.suspended && !suspensionInfo.whitelist.includes(content.name)) {
            // login is suspended
            // and the user is not in the whitelist
            let err = new Error('suspension of service');
            err.statusCode = 503;
            return next(err);
        }

        if (identity === STUDENT) {
            // Check if the name is valid. All name will be converted to lower case at client side.
            if (!registeredStudents.has(content.name)) {
                if (content.create) {
                    // we will create new user profile for unregistered users.
                    return res.send('Please create a new user.');
                } else {
                    // users must register before accessing the system
                    let err = new Error(`Student name ${content.name} not registered.`);
                    err.statusCode = 401;
                    return next(err);
                }
            }

            if (lectureMode === "sync") {
                // Check if the group assignment of the student match with current lecture
                // the administrator group id is -1. All other groups are greater or equal than 0.
                const groupId = registeredStudents.get(content.name).groupId;
                if (groupId >= 0 && groupId !== +content.group) {
                    let err = new Error(`Received groupID ${content.group} from ${content.name} does not match assigned ${groupId}`);
                    err.statusCode = 401;
                    return next(err);
                }
            }

            // Update ts if day has changed
            const loginTimestamp = new Date();
            if (loginTimestamp.getDay() !== ts.getDay()) ts = loginTimestamp;
            // Make new directory day by day
            const studentNumber = registeredStudents.get(content.name).studentId.toString();
            const infoDatePath = path.join(FILEPATH, "ai-workshop", studentNumber);
            if (!fs.existsSync(infoDatePath)) {
                fs.mkdir(infoDatePath,
                    {recursive: true},
                    (err) => {
                        if (err) throw err;
                    });
            }
        } else {
            // Teacher
            // Check if correct passcode is provided.
            if (content.passcodeHash !== teacherPasscodeHash) {
                let err = new Error('Wrong teacher passcode. Please retry.');
                err.statusCode = 401;
                return next(err);
            }
        }

        let cookie;
        if (lectureMode === "sync") {
            cookie = {
                'identity': content.identity,
                'name': content.name,
                'firstName': identity === STUDENT ? registeredStudents.get(content.name).firstName : null,
                'lastName': identity === STUDENT ? registeredStudents.get(content.name).lastName : null,
                'number': identity === STUDENT ? registeredStudents.get(content.name).studentId : null,
                'group': identity === STUDENT ? registeredStudents.get(content.name).groupId : null,
                'authcode': identity === STUDENT ? studentAuthHash : teacherAuthHash,
            }
        } else {
            const currentStudent = registeredStudents.get(content.name);
            cookie = {
                'identity': content.identity,
                'name': content.name,
                'firstName': currentStudent.firstName,
                'lastName': currentStudent.lastName,
                'number': currentStudent.studentId,
                'group': currentStudent.groupId,
                'age': currentStudent.age,
                'educationLevel': currentStudent.educationLevel,
                'authcode': studentAuthHash,
            }
        }

        res.cookie(
            'userInfo',
            JSON.stringify(cookie)
        );

        res.send({
            message: 'Cookie set.',
            userInfo: JSON.stringify({
                'name': cookie.name,
                'number': cookie.number
            }),
        });
    }
}

function generateAuthCookie(req, res) {
    // Generate authorization cookie.
    if (req.body.passcode !== adminPasscodeHash) {
        // Hash of passcode does not pass.
        res.statusCode = 401;
        res.send('Wrong message.')
    } else {
        // Passcode match. Generate authorization cookie.
        res.statusCode = 200;
        res.cookie('userInfo',
            JSON.stringify({
                'identity': 'admin',
                'authcode': adminAuthHash,
            }));
        res.send('Successfully logged in as admin.');
    }
}

/**
 * Create and materialize the newly created user to registeredStudents.json file.
 * This is called by the DEDICATED server to data sync issues.
 * @param req HTTP request argument to the middleware function, called "req" by convention.
 * @param res HTTP response argument to the middleware function, called "res" by convention.
 * @param next Callback argument to the middleware function, called "next" by convention.
 * @see https://expressjs.com/en/guide/writing-middleware.html
 */
function createNewUserProfile(req, res, next) {
    const name = req.body.username;

    // calculate some basic information for the new user
    let studentCount = JSON.parse(fs.readFileSync(regInfoFilenames.registeredStudents, 'utf8')).length;
    let groupID = Math.max(0, Math.floor((studentCount - presetUsers) / groupThreshold));

    // Check if the registration limit has been reached
    if ((studentCount - presetUsers) > groupThreshold) {
        // we have reached the registration limit.
        // abort
        let err = new Error('Registration limit is reached.');
        err.statusCode = 401;
        return next(err);
    }

    // materialize the new user profile
    let allRegisteredStudents = JSON.parse(fs.readFileSync(regInfoFilenames.registeredStudents, 'utf8'));
    const nameList = allRegisteredStudents.map(item => [item.firstName, item.lastName].join(" "))
    // check whether the user has already been in the registered file (avoid duplicates)
    if (nameList.indexOf(name) >= 0) {
        // the user has been registered.
        let err = new Error('Registration has already been completed.');
        err.statusCode = 401;
        return next(err);
    }

    allRegisteredStudents.push({
        "firstName": name.split(" ")[0],
        "lastName": name.split(" ")[1],
        "studentId": studentCount,
        "groupId": groupID,
        "age": -1,
        "educationLevel": "",
        "adminConfirmed": true // adminConfirm is disabled
    });
    fs.writeFileSync(regInfoFilenames.registeredStudents, JSON.stringify(allRegisteredStudents), 'utf-8');

    // set cookie
    res.statusCode = 200;
    res.cookie('userInfo', JSON.stringify({
        'identity': STUDENT,
        'name': name,
        'firstName': name.split(" ")[0],
        'lastName': name.split(" ")[1],
        'number': studentCount,
        'group': groupID,
        'age': -1,
        'educationLevel': "",
        'authcode': studentAuthHash,
    }));
    res.send({
        message: 'Successfully materialized the new user to registeredStudents.json.',
        userInfo: {
            'name': name,
            'number': studentCount,
        }
    });
}

module.exports = {
    verifyUserFactory: verifyUserFactory,
    newUserLogin: newUserLogin,
    generateAuthCookie: generateAuthCookie,
    createNewUserProfile: createNewUserProfile
}