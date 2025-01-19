const {
    errorHandler, getLogger, readRegisteredInfo, updateInfoFactory
} = require("./routers/helpers");
const studentRouterFactory = require("./routers/studentRouter"),
    teacherRouterFactory = require("./routers/teacherRouter"),
    videoRouterFactory = require("./routers/videoRouter");
const {
    config, identities, regInfoFilenames, regInfoUpdateInterval
} = require("./routers/globalSetting");
const {newUserLogin} = require("./routers/authentication")
const {FILEPATH, PORT, DNSServerIP, ReadFilesFrom} = config,
    {STUDENT, TEACHER, ADMIN} = identities;

let express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const multipart = require("connect-multiparty");
const {Resolver} = require('dns').promises;

const app = express();

// To process login form
const multipartyMiddleware = multipart();
// Logger initialization
const logger = getLogger('server');


/**
 * Reading registration information either locally (testing) or remotely (in deployment).
 */
// Read registered student name list
const filenamesToRead = {
    registeredStudents: regInfoFilenames.registeredStudents,
    suspension: regInfoFilenames.suspension,
};
let registeredInfo = {registeredStudents: undefined, suspension: undefined};
let lastModifiedTimes = {registeredStudents: undefined, suspension: undefined};

const updateInfo = updateInfoFactory(logger, lastModifiedTimes, registeredInfo);

if (ReadFilesFrom === "local") {
    // running locally. have access to files.
    for (const [infoname, filename] of Object.entries(filenamesToRead)) {
        readRegisteredInfo(filename).then(
            (info) => {
                registeredInfo[infoname] = info;
                lastModifiedTimes[infoname] = fs.statSync(filename).mtimeMs;
            }
        ).catch((err) => logger.error(err));

        if (regInfoUpdateInterval[infoname] > 0) {
            setInterval(() => {
                updateInfo(infoname).catch(err => {
                    logger.error(err.message)
                })
            }, regInfoUpdateInterval[infoname]);
        }
    }
} else {
    // need to delegate file r/w to dedicated server.
    // Find dedicated service for instructor
    // this part is deprecated. this part of codes are not used.
    const dedicated_service_hostname = 'dedicated-js-nodeport-service.default.svc.cluster.local';
    let dedicated_service_address = undefined;
    const resolver = new Resolver();
    resolver.setServers([DNSServerIP]); // Specify DNS server in the cluster.

    resolver.resolve4(dedicated_service_hostname).then((addresses) => {
        logger.info(`address of ${dedicated_service_hostname}: ${JSON.stringify(addresses)}`);
        dedicated_service_address = addresses[0];

        readRegisteredInfo(studentsFilename, lastModifiedTimes, dedicated_service_address)
            .then((response) => {
                if (lastModifiedTimes.registeredStudents !== response.lasttime) {
                    registeredInfo.registeredStudents = response.parsedData;
                    lastModifiedTimes.registeredStudents = response.lasttime;
                }
            })

        let maintainUsers = setInterval(() => {
            // logger.info(`Updating students list. ${registeredInfo.size} students.`)
            const stats = fs.statSync(studentsFilename);
            if (stats.mtimeMs === lastModifiedTimes) {
                // File not modified. Skip.
                // logger.info("No change since last update.");
                return
            }
            // File has been modified
            lastModifiedTimes = stats.mtimeMs;
            readRegisteredInfo(studentsFilename, lastModifiedTimes, dedicated_service_address)
                .then((response) => {
                    if (lastModifiedTimes !== response.lasttime) {
                        registeredInfo = response.parsedData;
                        lastModifiedTimes = response.lasttime;
                        logger.info(`Students name list updated. Now ${registeredInfo.size} students.`);
                    }
                }).catch((err) => logger.error(err));
        }, regInfoUpdateInterval[infoname]);
    }).catch(e => logger.error(e));
}

// ===================================
// HTTP server
let server = http.Server(app);
server.listen(PORT, function () {
    logger.info(`gaze server running @ ${PORT}`);
});

// ===================================
// App settings
// app.use(cors())
let ts = new Date();
const teacherRouter = teacherRouterFactory(logger, ts, __dirname, registeredInfo.registeredStudents),
    studentRouter = studentRouterFactory(__dirname),
    videoRouter = videoRouterFactory();

app.use(express.static(path.join(__dirname, 'public')));
app.post('/users', multipartyMiddleware, newUserLogin(logger, ts, registeredInfo));
app.use('/student', studentRouter)
app.use('/teacher', teacherRouter)
app.use('/video', videoRouter)

// Error handling
app.use(errorHandler(logger));
