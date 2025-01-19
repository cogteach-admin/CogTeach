const express = require('express')
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");
const router = express.Router()

const {config, identities} = require("./globalSetting");
const {verifyUserFactory} = require("./authentication");

const {FILEPATH} = config,
    {STUDENT, TEACHER, ADMIN} = identities;
const verifyUser = verifyUserFactory(TEACHER);

// middleware that is specific to this router
router.use(cookieParser(), express.json({type: '*/*'}), verifyUser)


function allStudentsFactory(logger, ts, registeredStudents) {
    return function (req, res) {
        // The filename is simple the local directory and tacks on the requested url
        let filename = `${ts.getFullYear()}-${ts.getMonth() + 1}-${ts.getDate()}`;
        // Check if student has related info
        let stuNums = [];
        for (let studentInfo of registeredStudents.values()) {
            let stuNum = studentInfo.studentId,
                groupNum = studentInfo.groupId;
            logger.debug(`Examining ${stuNum}, ${path.join(FILEPATH,
                `${stuNum}`,
                'info',
                `${filename}.json`
            )} existence: ${fs.existsSync(path.join(FILEPATH,
                `${stuNum}`,
                'info',
                `${filename}.json`
            ))}`);
            if (fs.existsSync(path.join(FILEPATH,
                `${stuNum}`,
                'info',
                `${filename}.json`
            ))) stuNums.push(stuNum);
        }

        res.statusCode = 200;
        res.send(JSON.stringify(stuNums));
    }
}

function studentInfoFactory(ts) {
    return function (req, res) {
        // The filename is simple the local directory and tacks on the requested url
        let filename = `${ts.getFullYear()}-${ts.getMonth() + 1}-${ts.getDate()}`;
        // This line opens the file as a readable stream
        const readStream = fs.createReadStream(path.join(FILEPATH,
            `${req.params['stuNum']}`,
            'info',
            `${filename}.json`
        ));
        // const readStream = fs.createReadStream(path.join(FILEPATH, `${req.params['stuNum']}`, 'info', '2021-4-24.json'));
        // This will wait until we know the readable stream is actually valid before piping
        readStream.on('open', function () {
            // This just pipes the read stream to the response object (which goes to the client)
            readStream.pipe(res);
        });
        // This catches any errors that happen while creating the readable stream (usually invalid names)
        readStream.on('error', function (err) {
            res.end(err);
        });
    }
}

/**
 * Factory function that connects some global variables with adminRouter.
 * @param logger The global logger.
 * @param ts The timestamp.
 * @param dirname
 * @param registeredStudents
 * @returns {Router}
 */
module.exports = function (logger, ts, dirname, registeredStudents) {
    const allStudents = allStudentsFactory(logger, ts, registeredStudents),
            studentInfo = studentInfoFactory(ts);

    router.use(express.static(path.join(dirname, 'restricted', 'teacher')))

    router.get('/studentInfo', allStudents);
    router.get('/studentInfo/:stuNum', studentInfo);

    return router
}