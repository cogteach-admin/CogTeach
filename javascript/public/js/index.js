/**
 * Specify whether we are working with sync/async lectures.
 */
let lectureMode = "async";

/**
 * Used for sync lectures
 */
const contactEmail = "cogteach.info@gmail.com"
const successPost = "User information posted successfully. Waiting for redirect...";

const registeringInfo = "We are creating a new user profile for you. Please wait...";
const registrationFail = `We cannot create an account for you. Please contact us via <a href="mailto:${contactEmail}">${contactEmail}</a> with a screenshot.`

const suspensionOfService = `We are currently performing updates to our website and services are suspended. Please contact us via <a href="mailto:${contactEmail}">${contactEmail}</a>.`

const studentLoginFail = `You are not registered. Please check you name spell (<b>exact as registration name</b>) or contact us via <a href="mailto:${contactEmail}">${contactEmail}</a>.`;
const studentGroupFail = "You are not assigned to the current group. Please check your <b>group arrangement</b>.";
const studentRegistrationFail = `We have reached the maximal number of students. Please contact us via <a href="mailto:${contactEmail}">${contactEmail}</a> if you still want to attend.`;

const teacherLoginFail = "Wrong passcode. Please retry.";
const adminLoginFail = "Wrong passcode for admin login. Please retry.";
const lectureFail = `Thanks for visiting the page. No lecture is registered on the server. Please contact us via <a href="mailto:${contactEmail}">${contactEmail}</a>.`
const closeTime = 5000; //ms
const errorLectureInfo = {
    lecture: {
        title: 'Thanks for visiting CogTeach!',
        abstract: `Cannot retrieve next lecture information. Please contact with related staff via <a href="mailto:${contactEmail}">${contactEmail}</a>.<br> Or click <a href="info.html">here</a> to learn more about the project.`,
        instructor: 'Unknown',
        time: 'Unknown',
        lectureId: undefined,
        groupId: undefined,
    }
}

/**
 * Disabling different elements on the page if identity is selected as instructor
 * @param e input event.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/input_event
 */
function selectIdentityTeacher(e) {
    document.getElementById("passcode").disabled = false;
    document.getElementById("first-name").disabled = true;
    document.getElementById("last-name").disabled = true;
}

/**
 * Disabling different elements on the page if identity is selected as student
 * @param e input event.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/input_event
 */
function selectIdentityStudent(e) {
    document.getElementById("passcode").disabled = true;
    document.getElementById("first-name").disabled = false;
    document.getElementById("last-name").disabled = false;
}

/**
 * ===============================
 * For synchronous lectures.
 * ===============================
 */

function fetchLectureMode() {
    return fetch("admin/lecture-mode").then(res => res.text())
}


// Get latest lecture information
function fetchTrials() {
    fetch('/admin/trial', {
        method: 'GET',
    }).then(res => res.json()
    ).then(lectureInfo => {
        if (lectureInfo === null) throw new Error('No registered or legal trial info.');
        localStorage.setItem("lectureInfo", JSON.stringify(lectureInfo));
        formatLectureInfo(lectureInfo);
    }).catch(e => {
        console.error(e);
        showAlert(lectureFail, 'warning');
        localStorage.removeItem("lectureInfo");
        formatLectureInfo(errorLectureInfo);
    })
}


function formatLectureInfo(lectureInfo) {
    // formatting lecture id and group information of the lecture
    let groupId = lectureInfo.lecture.groupId,
        lectureId = lectureInfo.lecture.lectureId;
    groupId = groupId === undefined ? "" : `(Group ${groupId})`;
    if (lectureId === undefined) {
        // no trial is registered
        lectureId = "";
    } else if (lectureId === 0) {
        // introductory session
        lectureId = "Introductory session:"
    } else {
        // normal experiment sessions
        lectureId = `Lecture ${lectureId}:`
    }

    // fill out the lecture card
    document.getElementById("lecture-title").innerHTML = [lectureId, lectureInfo.lecture.title, groupId].join(" ");
    document.getElementById("lecture-abstract").innerHTML = lectureInfo.lecture.abstract;
    document.getElementById("lecture-instructor").innerHTML = '<b>Instructor</b>: ' + lectureInfo.lecture.instructor;
    document.getElementById("lecture-time").innerHTML = '<b>Time</b>: ' + new Date(lectureInfo.lecture.time);
    // document.getElementById("lecture-zoomid").innerHTML = '<b>Zoom ID</b>: ' + lectureInfo.lecture.zoomid;

    document.getElementById("lecture-info").hidden = false;

    const currentTime = Date.now();
    console.log(`Current time: ${currentTime}, Readable form: ${new Date(currentTime)}`);
    console.log(`Lecture time: ${lectureInfo.lecture.time}, Readable form: ${new Date(lectureInfo.lecture.time)}`);
    if (Math.abs(currentTime - lectureInfo.lecture.time) < 30 * 60 * 1000) {
        document.getElementById('submitbtn').disabled = false;
    } else {
        document.getElementById('submitbtn').innerText = 'No hurry! Please come back when lecture will begin within 30 minutes.'
    }
}

/**
 * Handles login information of users to the server when using lectures.
 * @param e submit event
 * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/submit_event
 * @returns {Promise<void>} The user will be redirected to a new page.
 */
async function loginAsUser(e) {
    e.preventDefault(); // We will handle submit

    // =====Validation of email.
    const form = document.getElementById("login-form");
    if (lectureMode == "async" && !form.checkValidity()) {
        e.stopPropagation();
        document.getElementById("invalid-feedback").hidden = false;
        return
    }
    document.getElementById("invalid-feedback").hidden = true;

    // =====Disable buttons
    document.getElementById("submitbtn").innerText = "Submitting";
    document.getElementById("submitbtn").disabled = true;
    // document.getElementById("devbtn").innerText = 'Submitting'
    // document.getElementById("devbtn").disabled = true;

    // =====Post form data
    let formData = new FormData(e.target);

    if (document.getElementById('identity-0').checked) { // Student
        if (lectureMode == "sync") {
            // we are using the name provided by the student to decide whether they can proceed
            formData.set('name', [formData.get('first-name').toLowerCase().trim(), formData.get('last-name').toLowerCase().trim()].join(' '));
            formData.delete('first-name');
            formData.delete('last-name');
        } else {
            // we are using the email address to decide whether they can proceed.
            // If the email address is not registered before, we will create a new user profile on the server
            const email = formData.get('email').toLowerCase().trim();
            formData.set('name', email.split("@").join(" "));
            // the JS server will check if this is set. If so, it will return a response for user creation.
            formData.set('create', 'true');
        }
    } else { // Teacher
        formData.set('name', 'Instructor');
        formData.set('passcodeHash', await digestMessage(formData.get('passcode')));
        formData.delete('passcode');
    }

    // Add lecture group assignment
    if (lectureMode === "sync") {
        formData.set('group',
            JSON.parse(localStorage.getItem('lectureInfo')).lecture.groupId);
    }

    for (let [key, val] of formData.entries()) {
        console.log(`${key} : ${val}`);
    }

    fetch('/users', {
        method: 'POST',
        body: formData
    }).then(async (response) => {
        console.log(response);

        if (response.ok) {
            // the student is allowed to proceed
            // Login successful or have to create new user
            response.text().then(async (text) => {
                if (text.includes("create")) {
                    // We should create new user profiles
                    showAlert(registeringInfo, 'warning');
                    const success = await createNewUser(formData.get("name"));
                    if (!success) return
                }

                showAlert(successPost, 'success');
                // connectSocket();
                if (document.getElementById('identity-0').checked) {
                    if (lectureMode === "sync") {
                        window.open('/student/student.html', '_self');
                    } else {
                        window.open('/instruction.html', '_self');
                    }
                } else {
                    window.open('/teacher/teacher.html', '_self');
                }
            })
        } else {
            // The student is not allowed to proceed
            response.text().then(async (text) => {
                // document.getElementById("devbtn").innerText = 'Submitting'
                // document.getElementById("devbtn").disabled = true;
                if (document.getElementById('identity-0').checked) {
                    // students error
                    if (text.includes("group")) {
                        // group does not match
                        showAlert(studentGroupFail);
                        enableButtons();
                    } else if (text.includes("suspension")) {
                        // service is suspended.
                        showAlert(suspensionOfService);
                        enableButtons();
                    }  else {
                        // name is not registered
                        showAlert(studentLoginFail);
                        enableButtons();
                    }
                } else {
                    showAlert(teacherLoginFail);
                    closeAlert(closeTime);
                    enableButtons();
                }
            })
        }
    }).catch(err => {
        console.error(err)
    });
}

const enableButtons = function () {
    // =====Enable buttons
    document.getElementById("submitbtn").innerText = "Submit";
    document.getElementById("submitbtn").disabled = false;
}

function loginAsAdmin(passcodeHash) {
    fetch('/admin', {
        method: 'POST',
        body: JSON.stringify({passcode: passcodeHash}),
    }).then(res => {
        if (res.ok) {
            // Hide existing alert
            if (!document.getElementById("top-alert").hidden) document.getElementById("top-alert").hidden = true;
            window.open('admin.html', '_self');
        } else {
            // Alert user since wrong passcode is entered.
            showAlert(adminLoginFail);
            closeAlert(closeTime);
        }
    }).catch(e => {
        console.log(e);
    })
}

/**
 * Handles creation of new users. This is bound to the "Create New Profile" button.
 * @param username The name of new user.
 * @returns {Promise<boolean>} The user will be redirected to a new page.
 */
async function createNewUser(username) {
    // the dedicated JS server should have created a new entry in the registeredStudents.json file.
    let resJs = await fetch("/createUsers", {
        method: 'POST',
        body: JSON.stringify({username}), // passed but not used
    }).catch(err => console.error(err));

    console.log(resJs);

    let resText = await resJs.text();

    if (resJs.ok) {
        // user creation is successful on the JS side. Now proceed to Python side.
        const resObj = JSON.parse(resText);

        const resMsg = resObj.message.toLowerCase();
        const resUserInfo = resObj.userInfo;

        // inform python dedicated server to reload user_profile from the disk
        let resPy = await fetch("/internal/update", {
            method: 'POST',
            body: JSON.stringify({
                action: "create",
                first_name: resUserInfo.name.split(" ")[0],
                last_name: resUserInfo.name.split(" ")[1],
                student_id: resUserInfo.number,
            }),
        }).catch(err => {
            console.error(err)
        });

        console.log(resPy);

        if (resPy.ok) {
            return true
        } else {
            showAlert(registrationFail);
            enableButtons();
            return false
        }
    } else {
        // user creation failed
        if (resText.includes("complete")) {
            // the user is requesting duplicated registration
            // do nothing.

            // Or, the user currently has a duplicated registration
            //    (this happens when user failed to create an entry on the python side,
            //        and try to register again.
            //    Or, just register again before the materialized info is read by JS servers again.)
        } else {
            // We have reached the registration limit
            showAlert(studentRegistrationFail);
            enableButtons();
        }

        return false
    }
}

/**
 * ===============================
 * For asynchronous lectures (recorded lectures).
 * ===============================
 */

function formatTalkInfo(talkInfoList) {
    const availableBadge = `<span class="badge" style="background: #00cc66">Released</span>`,
        tbdBadge = `<span class="badge bg-secondary">Coming soon</span>`,
        ul = document.getElementById("talk-list");

    talkInfoList.forEach((talk, index) => {
        const talkListItem = document.createElement("li");
        talkListItem.classList.add("list-group-item");
        talkListItem.id = "talk-" + talk.talkId;
        if (talk.talkId === 0) {
            talkListItem.innerHTML = talk.title + (talk.availability ? availableBadge : tbdBadge);
        } else {
            talkListItem.innerHTML = `Lecture ${talk.talkId}: `
                + talk.title
                + (talk.availability ? availableBadge : tbdBadge);
        }
        ul.append(talkListItem);
    })

    document.getElementById("talk-info").hidden = false;
    document.getElementById('submitbtn').disabled = false;
}

function fetchTalks() {
    fetch('/admin/talks', {
        method: 'GET',
    }).then(res => res.json()
    ).then(talkInfo => {
        if (talkInfo === null) throw new Error('No registered or legal talk info.');
        localStorage.setItem("talkInfo", JSON.stringify(talkInfo));
        formatTalkInfo(talkInfo);
    }).catch(e => {
        console.error(e);
        showAlert(lectureFail, 'warning');
        localStorage.removeItem("talkInfo");
        formatLectureInfo(errorLectureInfo);
    })
}

/**
 * ===============================
 * Helper functions.
 * ===============================
 */

function showAlert(message, alertLevel) {
    // alertLevel = 'danger'/'success'
    let alert = document.getElementById("top-alert");
    alertLevel = ['alert', '-', alertLevel ? alertLevel : 'danger'].join('');
    alert.innerHTML = message;

    const allLevels = ["alert-danger", "alert-success", "alert-warning"];

    if (!alert.classList.contains(alertLevel)) {
        // Add new class and remove old class
        for (let level of allLevels) {
            if (level === alertLevel) continue;
            alert.classList.remove(level);
        }
        alert.classList.add(alertLevel);
    }

    if (alert.hidden) {
        alert.hidden = false;
    }
}

function closeAlert(delay) {
    setTimeout(() => {
        document.getElementById("top-alert").hidden = true
    }, delay);
}

/**
 * Return the SHA-256 hash of the input message.
 * @param {string} message The string to be hashed.
 * @returns {Promise<string>} SHA-256 hash result.
 */

async function digestMessage(message) {
    const msgUint8 = new TextEncoder().encode(message);                           // encode as (utf-8) Uint8Array
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);           // hash the message
    const hashArray = Array.from(new Uint8Array(hashBuffer));                     // convert buffer to byte array
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
    return hashHex;
}