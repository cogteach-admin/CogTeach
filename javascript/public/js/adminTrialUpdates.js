let allTrials;
const ADMIN = 3;
// ==============================================================
// Global experiment setting
let gazeInfo,
    cogInfo;
let syncing = false; // Avoid syncing multiple times
const SOCKET = false;

// =====================Socket.io=====================
// Socket connection to admin server
if (SOCKET) {
    const socket = io("https://cogteach.com/admin", {
        auth: {
            identity: ADMIN,
            name: 'Administrator',
        }
    });

    window.addEventListener("beforeunload", function (event) {
        socket.disconnect();
    });

    socket.on('users', (users) => {
        // Delete all existing list
        let ul = document.getElementById("name-list");
        ul.innerHTML = '';

        // Sort usernames by dictionary order
        console.log('USERS:');
        console.log(users);
        users = users.filter(user => Boolean(user.name)); // Filter out users whose undefined
        users.sort((a, b) => {
            if (a.name !== b.name) {
                if (a.name === 'Administrator') return -1;
                if (b.name === 'Administrator') return 1;
                if (a.name === 'Instructor') return -1;
                if (b.name === 'Instructor') return 1;
                return a.name.localeCompare(b.name);
            } else {
                return 0
            }
        });

        // Add new user li
        for (let user of users) {
            let new_li = document.createElement('li');
            new_li.id = user.userID;
            new_li.className = "list-group-item";
            new_li.innerText = user.name;
            ul.insertAdjacentElement('beforeend', new_li);
        }
    });

    socket.on("user disconnected", (userID) => {
        let li = document.getElementById(userID);
        if (li) {
            console.log(`User ${li.innerText} has disconnected from the server.`);
            li.remove();
        } else {
            console.warn('User disconnected, but not shown in the list.');
        }
    });

    socket.on("triggered", () => {
        document.getElementById("toolkits-feedback").innerText = `Successfully triggered. @ ${new Date()}`;
    })

    document.getElementById("student-start-trigger").addEventListener("click", () => {
        socket.emit("trigger-student-start");
    });
    document.getElementById("teacher-start-trigger").addEventListener("click", () => {
        socket.emit("trigger-teacher-start");
    });

    // Remove participant description
    document.getElementById("participant-description").remove();
} else {
    document.getElementById("student-start-trigger").addEventListener("click", () => {
        document.getElementById("toolkits-feedback").innerText = 'Socket is turned off. Cannot trigger.';
    });
    document.getElementById("teacher-start-trigger").addEventListener("click", () => {
        document.getElementById("toolkits-feedback").innerText = 'Socket is turned off. Cannot trigger.';
    });
}

// =====================HTTP====================
// HTTP functions

window.onload = function () {
    fetch('/admin/trials')
        .then(res => res.json())
        .then(trials => {
            allTrials = trials;
            if (trials.length === 0) {
                gazeInfo = true;
                cogInfo = true;
                console.error('No registered or legal trial info.');
                console.warn('Will use default setting.');
            } else {
                gazeInfo = allTrials[0].setting.gazeinfo;
                cogInfo = allTrials[0].setting.coginfo;
            }

            // Add trial description card
            trials.forEach((trial, trialno) => {
                console.log(`#${trialno + 1} trial.`)
                document.getElementById("post-card").insertAdjacentHTML('beforebegin', trialCardTemplate(trialno, trial));
            });

            // Update countdown information
            updateDelay();
        });
}

let trialCardTemplate = function (trialno, info) {
    return `<div class="card" id="card-${trialno}">
                <div class="card-body">
                    <h3 class="card-title" id="trial-title-${trialno}">Trial No.${trialno + 1}</h3>
                    <h5 class="card-title" id="lecture-title-${trialno}">${info.lecture.title}</h5>
                    <p class="card-text" id="lecture-abstract-${trialno}">${info.lecture.abstract}</p>
                </div>
                <ul class="list-group list-group-flush">
                    <li class="list-group-item" id="lecture-instructor-${trialno}"><b>Instructor</b>: ${info.lecture.instructor}</li>
                    <li class="list-group-item" id="lecture-time-${trialno}"><b>Time</b>: ${new Date(info.lecture.time)}</li>
                    <li class="list-group-item" id="lecture-zoomid-${trialno}"><b>Zoom ID</b>: ${info.lecture.zoomid}</li>
                </ul>

                <div class="card-body">
                    <h5 class="card-title" id="setting-title-${trialno}">Experiment Setting</h5>
                </div>
                <ul class="list-group list-group-flush">
                    <li class="list-group-item" id="setting-gazeinfo-${trialno}">Gaze Info: ${info.setting.gazeinfo ? 'On' : 'Off'}</li>
                    <li class="list-group-item" id="setting-coginfo-${trialno}">Cog Info: ${info.setting.coginfo ? 'On' : 'Off'}</li>
                </ul>

                <div class="card-footer">
                    <button id="edit-btn-${trialno}" class="btn btn-secondary" onclick="switchCard(${trialno})">Edit</button>
                    <button id="delete-btn-${trialno}" class="btn btn-danger" onclick="deleteCard(${trialno})">Delete</button>
                </div>
            </div>`
};

let trialEditTemplate = function (trialno, info) {
    return `<div class="card-body">
                <h5 class="card-title">Editing trial ${trialno} information</h5>

                <label for="edit-lecture-title-${trialno}">Lecture title</label>
                <input type="text" class="form-control" id="edit-lecture-title-${trialno}" value="${info.lecture.title}">

                <label for="edit-lecture-abstract-${trialno}">Lecture abstract</label>
                <textarea class="form-control" id="edit-lecture-abstract-${trialno}" rows="3">${info.lecture.abstract}</textarea>

                <label for="edit-lecture-instructor-${trialno}">Lecture instructor</label>
                <input type="text" class="form-control" id="edit-lecture-instructor-${trialno}" value="${info.lecture.instructor}">

                <label for="edit-lecture-time-${trialno}">Lecture time</label>
                <div class="row">
                    <div class="col">
                        <input type="date" class="form-control" id="edit-lecture-date-${trialno}">
                    </div>
                    <div class="col">
                        <input type="time" class="form-control" id="edit-lecture-time-${trialno}">
                    </div>
                    <div class="col">
                        <select class="form-control" id="edit-timezone-${trialno}">
                            <option value="-0700">PST</option>
                            <option value="-0600">MST</option>
                            <option value="-0500">CST</option>
                            <option value="-0400">EST</option>
                            <option value="+0800">BJG</option>
                        </select>
                    </div>
                </div>

                <label for="edit-lecture-zoomid-${trialno}">Lecture Zoom ID</label>
                <input type="text" class="form-control" id="edit-lecture-zoomid-${trialno}" value="${info.lecture.zoomid}">

                <label for="edit-lecture-title-${trialno}">Gaze information</label>
                <div class="form-check form-check-inline">
                    <input class="form-check-input" type="radio" name="gazeinfo" id="gazeinfo-true-${trialno}" value="true" ${info.setting.gazeinfo ? "checked" : ""}>
                    <label class="form-check-label" for="gaze-info-true">On</label>
                </div>
                <div class="form-check form-check-inline">
                    <input class="form-check-input" type="radio" name="gazeinfo" id="gazeinfo-false-${trialno}" value="false" ${info.setting.gazeinfo ? "" : "checked"}>
                    <label class="form-check-label" for="gaze-info-false">Off</label>
                </div>
                <br>
                <label for="edit-lecture-title-${trialno}">Cognitive information</label>
                <div class="form-check form-check-inline">
                    <input class="form-check-input" type="radio" name="coginfo" id="coginfo-true-${trialno}" value="true" ${info.setting.coginfo ? "checked" : ""}>
                    <label class="form-check-label" for="cog-info-true">On</label>
                </div>
                <div class="form-check form-check-inline">
                    <input class="form-check-input" type="radio" name="coginfo" id="coginfo-false-${trialno}" value="false" ${info.setting.coginfo ? "" : "checked"}>
                    <label class="form-check-label" for="cog-info-false">Off</label>
                </div>

                <div class="card-footer">
                    <button id="post-btn-${trialno}" class="btn btn-primary" onclick="updateCard(${trialno})">Submit</button>
                    <button id="clear-btn-${trialno}" class="btn btn-secondary" onclick="resetCard(${trialno})">Cancel</button>
                </div>
            </div>`;
}

// =====Change card from display to editable form
function switchCard(trialno) {
    // Retrieve information of instructor, Zoom ID and time from display card
    let instructor = document.getElementById(`lecture-instructor-${trialno}`).innerText.split(' ');
    instructor = instructor.slice(1, instructor.length).join(' ');
    let zoomid = document.getElementById(`lecture-zoomid-${trialno}`).innerText.split(' ');
    zoomid = +zoomid[zoomid.length - 1];
    let lectureDate = new Date(document.getElementById(`lecture-time-${trialno}`).innerText);
    console.log(lectureDate);

    // Format edit template
    document.getElementById(`card-${trialno}`).innerHTML = trialEditTemplate(
        trialno,
        {
            lecture: {
                title: document.getElementById(`lecture-title-${trialno}`).innerText,
                abstract: document.getElementById(`lecture-abstract-${trialno}`).innerText,
                instructor,
                time: document.getElementById(`lecture-time-${trialno}`).innerText,
                zoomid,
            },
            setting: {
                gazeinfo: document.getElementById(`setting-gazeinfo-${trialno}`).innerText.indexOf('On') >= 0,
                coginfo: document.getElementById(`setting-coginfo-${trialno}`).innerText.indexOf('On') >= 0,
            },
        }
    );

    // Handling time
    document.getElementById(`edit-lecture-date-${trialno}`).value = `${lectureDate.getFullYear()}-${
        lectureDate.getMonth() + 1 < 10 ? '0' + (lectureDate.getMonth() + 1) : lectureDate.getMonth() + 1
    }-${
        lectureDate.getDate() < 10 ? '0' + lectureDate.getDate() : lectureDate.getDate()
    }`;
    document.getElementById(`edit-lecture-time-${trialno}`).value = `${
        lectureDate.getHours() < 10 ? '0' + lectureDate.getHours() : lectureDate.getHours()
    }:${
        lectureDate.getMinutes() < 10 ? '0' + lectureDate.getMinutes() : lectureDate.getMinutes()
    }`;
    let offset = -lectureDate.getTimezoneOffset() / 60; // -7 for PDT.
    switch (offset) {
        case -4:
        case -5:
        case -6:
        case -7:
            document.getElementById(`edit-timezone-${trialno}`).value = `-0${-offset}00`;
            break;
        case 8:
            document.getElementById(`edit-timezone-${trialno}`).value = `+0${offset}00`;
            break;
        default:
            document.getElementById(`edit-timezone-${trialno}`).value = `-0700`;
    }
}

function resetCard(trialno) {
    document.getElementById(`card-${trialno}`).innerHTML = trialCardTemplate(trialno, allTrials[trialno]);
}

function clearCard() {
    // Clear lecture related information
    let fields = document.querySelectorAll('[id^="post-lecture"]');
    fields.forEach((field) => {
        if (field.tagName === "INPUT") {
            field.value = '';
        } else if (field.tagName === "TEXTAREA") {
            field.value = '';
        }
    });
    // Clear experiment information
    if (document.getElementById("gazeinfo-true").checked) document.getElementById("gazeinfo-true").checked = false;
    if (document.getElementById("gazeinfo-false").checked) document.getElementById("gazeinfo-false").checked = false;
    if (document.getElementById("coginfo-true").checked) document.getElementById("coginfo-true").checked = false;
    if (document.getElementById("coginfo-false").checked) document.getElementById("coginfo-false").checked = false;
}

// =====Communication with dedicated server
// {verb: add, lecture: lecture-info, setting: setting-info}
// {verb: delete, trialno: index}
// {verb: update, trialno: index, info: info}
function addCard(e) {
    e.preventDefault(); // We will handle submit
    let postBody = JSON.stringify({
        verb: 'add',
        lecture: {
            title: document.getElementById(`post-lecture-title`).value,
            abstract: document.getElementById(`post-lecture-abstract`).value,
            instructor: document.getElementById(`post-lecture-instructor`).value,
            time: (new Date([document.getElementById(`post-lecture-date`).value,
                document.getElementById(`post-lecture-time`).value,
                'GMT',
                document.getElementById(`post-timezone`).value].join(' '))).getTime(),
            zoomid: +document.getElementById(`post-lecture-zoomid`).value,
        },
        setting: {
            gazeinfo: document.getElementById(`gazeinfo-true`).checked,
            coginfo: document.getElementById(`coginfo-true`).checked,
        },
    });
    console.log(postBody);
    fetch('/admin/trials', {
        method: 'POST',
        body: postBody,
    }).then(response => {
        if (response.ok) {
            alert("Trial information posted.");
            location.reload();
        }
    }).catch(err => {
        console.error(err);
    });
}

document.addEventListener("submit", addCard); // We will handle submit

function updateCard(trialno) {
    let postBody = JSON.stringify({
        verb: 'update',
        trialno,
        info: {
            lecture: {
                title: document.getElementById(`edit-lecture-title-${trialno}`).value,
                abstract: document.getElementById(`edit-lecture-abstract-${trialno}`).value,
                instructor: document.getElementById(`edit-lecture-instructor-${trialno}`).value,
                time: (new Date([document.getElementById(`edit-lecture-date-${trialno}`).value,
                    document.getElementById(`edit-lecture-time-${trialno}`).value,
                    'GMT',
                    document.getElementById(`edit-timezone-${trialno}`).value].join(' '))).getTime(),
                zoomid: document.getElementById(`edit-lecture-zoomid-${trialno}`).value,
            },
            setting: {
                gazeinfo: document.getElementById(`gazeinfo-true-${trialno}`).checked,
                coginfo: document.getElementById(`coginfo-true-${trialno}`).checked,
            },
        },
    })
    console.log(postBody);
    fetch('/admin/trials', {
        method: 'POST',
        body: postBody,
    }).then(response => {
        if (response.ok) {
            alert("Trial information updated.");
            location.reload();
        }
    }).catch(err => {
        console.error(err);
    });
}

function deleteCard(trialno) {
    fetch('/admin/trials', {
        method: 'POST',
        body: JSON.stringify({
            verb: 'delete',
            trialno,
        }),
    }).then(response => {
        if (response.ok) {
            alert("User information deleted.");
            location.reload();
        }
    }).catch(err => {
        console.error(err);
    });
}

//=====Update information on countdown card
function updateDelay() {
    if (allTrials.length === 0) {
        document.getElementById("countdown-description").innerText = 'No trial is registered on server.'
    } else {
        let i = 0;
        while (i < allTrials.length) {
            const delay = allTrials[i].lecture.time - Date.now();
            if (delay < 0) {
                ++i;
                continue;
            } else {
                updateCountdown(delay);
                break;
            }
        }

        if (i === allTrials.length) document.getElementById("countdown-description").innerText = 'All registered trials expired.'
    }
}

function updateCountdown(delay) {
    // Change information on modal box
    delay = delay / 1000; // in seconds
    let seconds = Math.floor(delay) % 60;
    delay = (delay - seconds) / 60; // in minutes
    let minutes = Math.floor(delay) % 60;
    delay = (delay - minutes) / 60; // in hours
    let hours = Math.floor(delay);

    document.getElementById("countdown-description").innerText = `${hours < 10 ? '0' + hours : hours}:${minutes < 10 ? '0' + minutes : minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
    // Schedule removal of the modal box
    let countdown = setInterval(() => {
        [hours, minutes, seconds] = document.getElementById("countdown-description").innerText.split(':');
        hours = +hours;
        minutes = +minutes;
        seconds = +seconds;

        // countdown is over
        if (hours === 0 && minutes === 10 && seconds === 0) {
            clearInterval(countdown);
            document.getElementById("countdown-description").innerText = 'Trial begins. Refresh page to update.';
        }

        if (seconds === 0) {
            seconds = 59;
            if (minutes === 0 && hours > 0) {
                minutes = 59;
                hours = hours - 1;
            } else {
                minutes = minutes - 1;
            }
        } else {
            seconds = seconds - 1;
        }
        document.getElementById("countdown-description").innerText = `${hours < 10 ? '0' + hours : hours}:${minutes < 10 ? '0' + minutes : minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
    }, 1000);
}

// =====================Bootstrap navigation bar=====================
$('#nav-tab a').on('click', function (e) {
    e.preventDefault();
    $(this).tab('show');
})
