const modalElements = {
    modal: {
        DOMElement: "div",
        classList: ["modal", "fade"],
        attributeList: {
            "role": "dialog"
        },
    },
    modalDialog: {
        DOMElement: "div",
        classList: ["modal-dialog"],
    },
    modalContent: {
        DOMElement: "div",
        classList: ["modal-content"],
    },
    modalBody: {
        DOMElement: "div",
        classList: ["modal-body"],
    },
    modalFooter: {
        DOMElement: "div",
        classList: ["modal-footer"],
    }
}


const modalTemplate = function (nodeDescriptions, nodeStructure) {
    let elements = [];
    for (let [node, subStructure] of Object.entries(nodeStructure)) {
        let description = nodeDescriptions[node];

        let element = document.createElement(description.DOMElement);

        // set up class
        if (description.classList) {
            element.classList.add(...description.classList);
        }

        // set up attribute
        if (description.attributeList) {
            for (let [attr, value] of Object.entries(description.attributeList)) {
                element.setAttribute(attr, value);
            }
        }

        // set up inner content
        if (description.innerHTML) {
            element.innerHTML = description.innerHTML;
        }

        // add sub nodes
        if (Object.keys(subStructure).length !== 0) {
            // have more subnodes
            let subNodes = modalTemplate(nodeDescriptions, subStructure);
            subNodes.forEach((subNode) => {
                element.insertAdjacentElement("beforeend", subNode);
            })
        }

        elements.push(element);
    }
    return elements
}

export class ModalDialog {
    constructor(modalName, descriptions, structure, initCallback = () => {}) {

        this.modalName = modalName;

        this.modalId = this.modalName + "-modal";
        this.confirmBtnId = this.modalName + "-btn";
        this.cancelBtnId = this.modalName + "-close-btn";

        this.initCallback = initCallback;

        let newModal = {
            ...descriptions,
            ...JSON.parse(JSON.stringify(modalElements))
        };

        for (let key of Object.keys(newModal)) {
            if (newModal[key]["attributeList"]) {
                newModal[key]["attributeList"]["id"] = modalName + "-" + key;
            } else {
                newModal[key]["attributeList"] = {id: modalName + "-" + key};
            }
        }

        this.DOMElement = modalTemplate(newModal, structure)[0];
    }

    /**
     *
     * @param callbacks
     * @param {function} callbacks.confirmCallback
     * @param {function} callbacks.cancelCallback
     * @param {function} init
     * @returns {Promise<unknown>}
     */
    start(callbacks, init) {
        const {confirmCallback = () => {},
            cancelCallback = () => {},
        } = callbacks
        this.open();
        init();
        return new Promise((resolve, reject) => {
            this.onconfirm = event => {
                confirmCallback();
                resolve("Done");
            }

            this.oncancel = event => {
                cancelCallback();
                resolve("Done");
            }
        })
    }

    end() {
        this.close();
    }

    open() {
        document.getElementById(this.modalId).style.display = "block";
        document.getElementById(this.modalId).className += "show";
    }

    close() {
        document.getElementById(this.modalId).style.display = "none"
        document.getElementById(this.modalId).className += document.getElementById(this.modalId).className.replace("show", "")
    }

    set onconfirm(f) {
        const btn = document.getElementById(this.confirmBtnId);
        if (btn) {
            btn.onclick = f;
        } else {
            console.warn([this.modalId, "Confirm button is not defined."].join(" "))
        }
    }

    set oncancel(f) {
        const btn = document.getElementById(this.cancelBtnId);
        if (btn) {
            btn.onclick = f;
        } else {
            console.warn([this.modalId, "Cancel button is not defined."].join(" "))
        }
    }
}

export class CameraSelectionModalDialog extends ModalDialog {
    constructor(onConfirm = () => {}) {
        const description = {
                "title": {
                    DOMElement: "h4",
                    innerHTML: "Camera selection."
                },
                "description-0": {
                    DOMElement: "p",
                    innerHTML: "The browser detects multiple cameras are connected to your device. Please select the one you would like to use and then click <b>Confirm</b>. We recommend choosing a front-facing camera."
                },
                "description-1": {
                    DOMElement: "p",
                    innerHTML: "Loading..."
                },
                "btn": {
                    DOMElement: "button",
                    classList: ["btn", "btn-primary", "btn-sm"],
                    attributeList: {
                        "type": "button",
                        "data-dismiss": "modal",
                    },
                    innerHTML: "Confirm"
                }
            },
            structure = {
                "modal": {
                    "modalDialog": {
                        "modalContent": {
                            "modalBody": {
                                "title": {},
                                "description-0": {},
                                "description-1": {},
                            },
                            "modalFooter": {
                                "btn": {}
                            }
                        }
                    }
                }
            },
            modalName = "camera";

        super(modalName, description, structure);

        this.title = modalName + "-title";
        this.description_0 = modalName + "-description-0";
        this.description_1 = modalName + "-description-1";

        this.onconfirm = onConfirm;
    }

    start() {
        const description = document.getElementById(this.description_1);
        
        return new Promise(function (resolve, reject) {
            if (!navigator.mediaDevices.enumerateDevices) {
                resolve("Done");
            }
            
            navigator.mediaDevices.enumerateDevices()
            .then(devices => {
                devices = devices.filter(device => device.kind === 'videoinput');

                switch (devices.length) {
                    case 0:
                        description.innerText = 'No camera available. Please check your device connection.';
                        resolve("Done");
                        break
                    case 1:
                        cameraId = devices[0].deviceId;
                        resolve("Done");
                        break
                    default:
                        // More than one camera
                        description.innerText = 'Please choose the camera you would like to use.';

                        this.onconfirm = event => {
                            cameraId = +Array.from(document.querySelectorAll("input[className='form-check-input']"))
                                .filter(radio => radio.checked)[0]
                                .id.slice(-1);
                            cameraId = devices[cameraId].deviceId;
                            navigator.mediaDevices.getUserMedia({video: {deviceId: cameraId}});

                            resolve("Done");
                        }

                        devices.forEach((device, i) => {
                            let radio = document.createElement('div');
                            radio.classList.add('form-check');
                            radio.innerHTML =
                                `<input className="form-check-input" type="radio" name="camera" id="cameraRadio${i}">
                                <label className="form-check-label" htmlFor="cameraRadio${i}">
                                ${device.label}</label>`;
                            description.insertAdjacentElement('beforeend', radio);
                        });
                        let radio = document.getElementById("cameraRadio0");
                        radio.checked = true;
                }
            })
        })
    }
    
    end() {
        this.close();
    }
}

// Legacy codes. Implementation in this way failed as it does not cater for the requirements.
// The pre/post-lecture test requires confirming the content from server and then close.
// current codes in this file failed to achieve this.
const preTestModalDescription = {
        "title": {
            DOMElement: "h4",
            innerHTML: "How much do you know before the talk?"
        },
        "description-0": {
            DOMElement: "p",
            innerHTML: "Scientists prove that taking a quiz before the lecture is helpful for focusing on important concepts introduced in the lecture."
        },
        "description-1": {
            DOMElement: "div",
            classList: "inputs d-flex flex-row justify-content-center mt-2".split(" "),
            innerHTML: prepareOTP("pre-lecture"),
        },
        "btn": {
            DOMElement: "button",
            classList: ["btn", "btn-primary", "btn-sm"],
            attributeList: {
                "type": "button",
                "data-dismiss": "modal",
            },
            innerHTML: "Completed",
        }
    },
    postTestModalDescription = {
        "title": {
            DOMElement: "h4",
            innerHTML: "Post-lecture Test."
        },
        "description-0": {
            DOMElement: "p",
            innerHTML: "Please complete this test."
        },
        "description-1": {
            DOMElement: "div",
            innerHTML: prepareOTP("post-lecture")
        },
        "btn": {
            DOMElement: "button",
            classList: ["btn", "btn-primary", "btn-sm"],
            attributeList: {
                "type": "button",
                "data-dismiss": "modal",
            },
            innerHTML: "Completed",
        }
    },
    calibrationModalDescription = {
        "title": {
            DOMElement: "h4",
            innerHTML: "Please calibrate the gaze estimator for gaze collection.",
        },
        "description-0": {
            DOMElement: "p",
            innerHTML: "Please calibrate the gaze estimator for gaze collection.",
        },
        "close-btn": {
            DOMElement: "button",
            classList: ["btn", "btn-secondary", "btn-sm", "skip"],
            attributeList: {
                "type": "button",
                "data-dismiss": "modal",
            },
            innerHTML: "Skip",
        },
        "btn": {
            DOMElement: "button",
            classList: ["btn", "btn-primary", "btn-sm"],
            attributeList: {
                "type": "button",
                "data-dismiss": "modal",
            },
            innerHTML: "Calibrate",
        }
    }

const preTestModalStructure = {
        "modal": {
            "modalDialog": {
                "modalContent": {
                    "modalBody": {
                        "title": {},
                        "description-0": {},
                        "description-1": {},
                    },
                    "modalFooter": {
                        "btn": {}
                    }
                }
            }
        }
    },
    postTestModalStructure = preTestModalStructure,
    calibrationModalStructure = {
        "modal": {
            "modalDialog": {
                "modalContent": {
                    "modalBody": {
                        "title": {},
                        "description-0": {},
                    },
                    "modalFooter": {
                        "close-btn": {},
                        "btn": {}
                    }
                }
            }
        }
    };

const cameraSelectionModal = new CameraSelectionModalDialog(),
    preTestModal = new ModalDialog("pre-test", preTestModalDescription, preTestModalStructure),
    calibrationModal = new ModalDialog("calibration", calibrationModalDescription, calibrationModalStructure),
    postTestModal = new ModalDialog("post-test", postTestModalDescription, postTestModalStructure);

function prepareOTP(name) {
    return `<p>Please enter the <b>confirmation code after the test</b> here:</p>
            <input class="m-2 text-center rounded" type="text" id="${name}-1" maxlength="1" />
            <input class="m-2 text-center rounded" type="text" id="${name}-2" maxlength="1" />
            <input class="m-2 text-center rounded" type="text" id="${name}-3" maxlength="1" />
            <input class="m-2 text-center rounded" type="text" id="${name}-4" maxlength="1" />`
}

// // procedure before video control
//     cameraSelectionModal.start().then(() => {
//         cameraSelectionModal.end();
//
//         // have to wait for selecting camera ready
//         prepareProcedure();
//         procedure.init();
//
//         // TODO: Send pre-test begin time
//         uploadCheckpoint("pre_test_start_time");
//         return preTestModal.start({
//             confirmCallback: () => {
//                 // TODO: Send pre-test end time
//                 fetch("/admin/confirmation", {
//                     method: "POST",
//                     body: JSON.stringify({
//                         talkId: localStorage.getItem("talkId"),
//                         testName: "pre-lecture",
//                         code: getOTPCode("pre-lecture"),
//                     })
//                 }).then(res => res.json())
//                     .then(data => console.log(data))
//             }
//         }, () => OTPInput("pre-lecture"))
//     }).then(() => {
//         console.log("pre text modal done.")
//         preTestModal.end();
//         return calibrationModal.start({
//                 confirmCallback: () => {
//                     procedure.calibrateGazeEstimator(
//                         () => {
//                             // TODO: Send calibration start time
//                             uploadCheckpoint("calibrate_start_time")
//                         }
//                     )
//                 }
//             }
//             , () => OTPInput("pre-lecture"));
//     }).then(() => {
//         calibrationModal.end();
//     })
//     // .catch(err => console.error(err.name + ": " + err.message));
//
//     // procedure after video
//     const video = document.getElementById("talk-video");
//     video.addEventListener("ended", () => {
//         // TODO: send videoendTime to server
//         uploadCheckpoint("video_end_time");
//         procedure.end();
//         uploadCheckpoint("post_test_start_time");
//
//
//         return postTestModal.start({
//                 confirmCallback: () => {
//                     // TODO: Send pre-test end time
//                     uploadCheckpoint("post_test_end_time");
//                 }
//             }, () => OTPInput("post-lecture")
//         ).then(() => {
//             console.log("post text modal done.");
//             endTalk();
//             postTestModal.end();
//         });
//     })