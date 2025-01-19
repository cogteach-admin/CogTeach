const express = require('express')
const cookieParser = require("cookie-parser");
const path = require("path");
const router = express.Router()

const {identities} = require("./globalSetting");
const {verifyUserFactory} = require("./authentication");

const {STUDENT, TEACHER, ADMIN} = identities;
const verifyUser = verifyUserFactory(STUDENT);

// middleware that is specific to this router
router.use(cookieParser(), express.json({type: '*/*'}), verifyUser);

/**
 * Factory function that connects the directory name with studentRouter.
 * @param dirname
 * @returns {Router}
 */
module.exports = function (dirname) {
    router.use(express.static(path.join(dirname, 'restricted', 'student')));

    // router.get("/student.html", (req, res) => {
    //     res.statusCode = 200;
    //     res.sendFile(path.join(dirname, 'restricted', 'student', 'student.html'));
    // })
    return router
}