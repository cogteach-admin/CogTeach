const express = require("express");
const cookieParser = require("cookie-parser");
const fs = require("fs");
let adminRouter = express.Router();

const {Trial} = require("./helpers");
const {verifyUserFactory, generateAuthCookie} = require("./authentication")
const {
    identities,
    lectureMode,
    regInfoFilenames,
    getPowerFormLinks,
    getTestConfirmationCode,
    getQuestionnaireLinks
} = require("./globalSetting")

verifyUser = verifyUserFactory(identities.ADMIN);

adminRouter.post('/', express.json({type: '*/*'}), generateAuthCookie);

adminRouter.post('/trials',
    cookieParser(),
    express.json({type: '*/*'}),
    verifyUser,
    informationPost);


function informationPost(req, res) {
    // req.body
    // {verb: add, lecture: lecture-info, setting: setting-info}
    // {verb: delete, trialno: index}
    // {verb: update, trialno: index, info: info}
    logger.info('===================================');
    logger.info('Received ' + req.body.verb.toUpperCase() + ' request.')
    let registeredTrials = registeredInfo.registeredTrials;
    switch (req.body.verb) {
        case 'add':
            registeredTrials.push(new Trial(req.body.lecture, req.body.setting));
            registeredTrials.sort((a, b) => a.lecture.time - b.lecture.time);
            res.statusCode = 202;
            res.send('Add new trial successfully.');
            logger.info('Add new trial successfully. There are ' + registeredTrials.length + ' registered trials.');
            logger.info(req.body.lecture, req.body.setting);
            break
        case 'delete':
            registeredTrials.splice(req.body.trialno, 1); // from index req.body.trialno remove 1 element
            res.statusCode = 202;
            res.send('Delete specified trial successfully.');
            logger.info('Delete specified trial successfully. There are ' + registeredTrials.length + ' registered trials.');
            break
        case 'update':
            registeredTrials[req.body.trialno].updateTrialInfo(req.body.info);
            res.statusCode = 202;
            res.send('Update specified trial successfully.');
            logger.info('Update specified trial successfully. There are ' + registeredTrials.length + ' registered trials.');
            logger.info(req.body.info);
            break
        default:
            res.statusCode = 404;
            res.send('Invalid verb.')
    }

    fs.writeFile(filenames.registeredTrials, JSON.stringify(registeredTrials), 'utf-8', (err) => {
        if (err) throw err;
        logger.info('The trials has been saved to file!');
    })
}

/**
 * Factory function that connects the registeredInfo with adminRouter.
 * @param logger
 * @param registeredInfo
 * @returns {Router}
 */
module.exports = function (logger, registeredInfo) {
    adminRouter.get('/trial',
        (req, res) => {
            res.statusCode = 200;
            // req.body.number specifies how many lecture information is required.
            if (registeredInfo.registeredTrials.length > 0) {
                res.send(registeredInfo.registeredTrials[0]);
            } else {
                res.send(null);
            }
        });

    adminRouter.get('/trials',
        (req, res) => {
            res.statusCode = 200;
            // req.body.number specifies how many lecture information is required.
            res.send(registeredInfo.registeredTrials);
        });

    adminRouter.get('/talks',
        (req, res) => {
            res.statusCode = 200;
            // req.body.number specifies how many lecture information is required.
            res.send(registeredInfo.registeredTalks);
        });

    adminRouter.get('/lecture-mode',
        (req, res) => {
            res.statusCode = 200;
            // req.body.number specifies how many lecture information is required.
            res.send(lectureMode);
        });

    /**
     * Used for pre/post-lecture test confirmation.
     */
    adminRouter.post('/confirmation',
        express.json({type: '*/*'}),
        (req, res) => {
            let talkId = req.body["talkId"],
                testName = req.body["testName"],
                code = req.body["code"];
            // comparing number
            res.send(getTestConfirmationCode(talkId, testName) === +code)
        });

    adminRouter.get('/consent-forms',
        cookieParser(),
        (req, res) => {
            let parsedCookie = JSON.parse(req.cookies['userInfo']);
            const name = parsedCookie.name;
            const registeredStudent = registeredInfo.registeredStudents.get(name);

            res.statusCode = 200;
            if (registeredStudent) {
                // the user has been created
                res.send({
                    links: getPowerFormLinks(registeredStudent.age),
                    adminConfirmed: registeredStudent.adminConfirmed,
                });
            } else {
                // the user is not yet created. We should wait for at least a few minutes.
                res.send({
                    links: getPowerFormLinks(parsedCookie.age),
                    adminConfirmed: false,
                });
            }
        })

    adminRouter.get('/questionnaire',
        cookieParser(),
        (req, res) => {
            let parsedCookie = JSON.parse(req.cookies['userInfo']);
            const group = parsedCookie.group;

            res.send({
                links: getQuestionnaireLinks(group),
            });
        })

    /**
     * Suspension related
     */
    adminRouter.post('/suspension',
        cookieParser(),
        express.json({type: '*/*'}),
        verifyUser,
        (req, res) => {
            // req.body
            // {verb: add, firstname: str, lastname: str}
            // {verb: suspend, state: boolean}
            logger.info('===================================');
            logger.info('Suspension received ' + req.body.verb.toUpperCase() + ' request.')
            let suspension = registeredInfo.suspension;
            switch (req.body.verb) {
                case "fetch":
                    res.statusCode = 202;
                    res.send({
                        message: `Current state: ${suspension.suspended ? "suspended" : "active"}`,
                        data: suspension,
                    });
                    break
                case 'add':
                    let newName = [req.body.firstname.toLowerCase(), req.body.lastname.toLowerCase()].join(" ")
                    if (suspension.whitelist.includes(newName)) {
                        res.statusCode = 202;
                        res.send({message: `Name ${newName} already exists.`});
                    } else {
                        suspension.whitelist.push(newName);
                        res.statusCode = 202;
                        res.send({message: `Add new name ${newName}.`, data: suspension});
                        logger.info(`Add new name ${newName} successfully. There are ` + suspension.whitelist.length + ' names in the whitelist.');
                    }
                    break
                case 'suspend':
                    if (req.body.suspended === suspension.suspended) {
                        res.statusCode = 202;
                        res.send({
                            message: `State suspension.suspended is already ${suspension.suspended}.`
                        });
                    } else {
                        suspension.suspended = req.body.suspended;
                        res.statusCode = 202;
                        res.send({
                            message: `State suspension.suspended is changed to ${suspension.suspended}.`,
                            data: suspension
                        });
                        logger.info(`State suspension.suspended is changed to ${suspension.suspended}.`);
                    }
                    break
                default:
                    res.statusCode = 404;
                    res.send({message: 'Invalid verb.'})
            }

            if (req.body.verb !== "fetch") {
                fs.writeFile(
                    regInfoFilenames.suspension,
                    JSON.stringify(suspension),
                    'utf-8',
                    (err) => {
                        if (err) throw err;
                        logger.info('Suspension information is materialized.');
                    })
            }
        }
    )

    /**
     * Not used. Handled in Python server.
     * @deprecated
     */
    adminRouter.get('/talk_history',
        cookieParser(),
        (req, res) => {
            let parsedCookie = JSON.parse(req.cookies['userInfo']);
            const stuNum = +parsedCookie.number;
            res.statusCode = 200;
            // req.body.number specifies how many lecture information is required.
            res.send(registeredInfo.talkHistory[stuNum]);
        });

    return adminRouter
}