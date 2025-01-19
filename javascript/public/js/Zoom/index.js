(function () {
  var testTool = window.testTool;
  if (testTool.isMobileDevice()) {
    vConsole = new VConsole();
  }
  console.log("checkSystemRequirements");
  console.log(JSON.stringify(ZoomMtg.checkSystemRequirements()));

  // it's option if you want to change the WebSDK dependency link resources. setZoomJSLib must be run at first
  // if (!china) ZoomMtg.setZoomJSLib('https://source.zoom.us/1.8.1/lib', '/av'); // CDN version default
  // else ZoomMtg.setZoomJSLib('https://jssdk.zoomus.cn/1.8.1/lib', '/av'); // china cdn option
  // ZoomMtg.setZoomJSLib('http://localhost:9999/node_modules/@zoomus/websdk/dist/lib', '/av'); // Local version default, Angular Project change to use cdn version
  ZoomMtg.preLoadWasm(); // pre download wasm file to save time.

  var API_KEY = "REPLACE_WITH_YOUR_OWN_ZOOM_ZAPIKEY";

  /**
   * NEVER PUT YOUR ACTUAL API SECRET IN CLIENT SIDE CODE, THIS IS JUST FOR QUICK PROTOTYPING
   * The below generateSignature should be done server side as not to expose your api secret in public
   * You can find an eaxmple in here: https://marketplace.zoom.us/docs/sdk/native-sdks/web/essential/signature
   */
  var API_SECRET = "REPLACE_WITH_YOUR_OWN_ZOOM_API_SECRET";

  // some help code, remember mn, pwd, lang to cookie, and autofill.
  // document.getElementById("display_name").value =
  //   "CDN" +
  //   ZoomMtg.getJSSDKVersion()[0] +
  //   testTool.detectOS() +
  //   "#" +
  //   testTool.getBrowserInfo();
  // document.getElementById("meeting_number").value = testTool.getCookie(
  //   "meeting_number"
  // );
  // [2021/6/26] Autofill the fields with cookie userInfo and localStorage.getItem("lectureInfo")
  let userInfo = testTool.getCookie("userInfo");
  const STUDENT = 1;
  const TEACHER = 2;
  if (userInfo) {
    userInfo = JSON.parse(userInfo);
    if (+userInfo.identity === STUDENT) {
        document.getElementById("display_name").value = 'Student ' + userInfo.name.split(' ')[0].toUpperCase();
    } else if (+userInfo.identity === TEACHER) {
        document.getElementById("display_name").value = userInfo.name;
    } else {
        document.getElementById("display_name").value = 'Administrator';
    }
  } else {
    document.getElementById("display_name").value = 'Name unknown';
  }

  let lectureInfo = JSON.parse(localStorage.getItem("lectureInfo"));
  document.getElementById("meeting_number").value = lectureInfo !== null ? lectureInfo.lecture.zoomid : testTool.getCookie(
      "meeting_number"
  );
  document.getElementById("meeting_pwd").value = testTool.getCookie(
    "meeting_pwd"
  );
  if (testTool.getCookie("meeting_lang"))
    document.getElementById("meeting_lang").value = testTool.getCookie(
      "meeting_lang"
    );

  document
    .getElementById("meeting_lang")
    .addEventListener("change", function (e) {
      testTool.setCookie(
        "meeting_lang",
        document.getElementById("meeting_lang").value
      );
      testTool.setCookie(
        "_zm_lang",
        document.getElementById("meeting_lang").value
      );
    });
  // copy zoom invite link to mn, autofill mn and pwd.
  document
    .getElementById("meeting_number")
    .addEventListener("input", function (e) {
      var tmpMn = e.target.value.replace(/([^0-9])+/i, "");
      if (tmpMn.match(/([0-9]{9,11})/)) {
        tmpMn = tmpMn.match(/([0-9]{9,11})/)[1];
      }
      var tmpPwd = e.target.value.match(/pwd=([\d,\w]+)/);
      if (tmpPwd) {
        document.getElementById("meeting_pwd").value = tmpPwd[1];
        testTool.setCookie("meeting_pwd", tmpPwd[1]);
      }
      document.getElementById("meeting_number").value = tmpMn;
      testTool.setCookie(
        "meeting_number",
        document.getElementById("meeting_number").value
      );
    });

  document.getElementById("clear_all").addEventListener("click", function (e) {
    testTool.deleteAllCookies();
    document.getElementById("display_name").value = "";
    document.getElementById("meeting_number").value = "";
    document.getElementById("meeting_pwd").value = "";
    document.getElementById("meeting_lang").value = "en-US";
    document.getElementById("meeting_role").value = 0;
    window.location.href = "/index.html";
  });

  // click join meeting button
  document
    .getElementById("join_meeting")
    .addEventListener("click", function (e) {
      e.preventDefault();
      var meetingConfig = testTool.getMeetingConfig();
      if (!meetingConfig.mn || !meetingConfig.name) {
        alert("Meeting number or username is empty");
        return false;
      }


      testTool.setCookie("meeting_number", meetingConfig.mn);
      testTool.setCookie("meeting_pwd", meetingConfig.pwd);

      var signature = ZoomMtg.generateSignature({
        meetingNumber: meetingConfig.mn,
        apiKey: API_KEY,
        apiSecret: API_SECRET,
        role: meetingConfig.role,
        success: function (res) {
          console.log(res.result);
          meetingConfig.signature = res.result;
          meetingConfig.apiKey = API_KEY;
          var joinUrl = "/meeting.html?" + testTool.serialize(meetingConfig);
          console.log(joinUrl);
          // window.open(joinUrl, "_blank");
          window.open(joinUrl, "websdk-iframe"); // open within iframe
          // // 2020.10.28
          // testTool.createZoomNode("websdk-iframe", joinUrl);
        },
      });
    });

  // click copy jon link button
  window.copyJoinLink = function (element) {
    var meetingConfig = testTool.getMeetingConfig();
    if (!meetingConfig.mn || !meetingConfig.name) {
      alert("Meeting number or username is empty");
      return false;
    }
    var signature = ZoomMtg.generateSignature({
      meetingNumber: meetingConfig.mn,
      apiKey: API_KEY,
      apiSecret: API_SECRET,
      role: meetingConfig.role,
      success: function (res) {
        console.log(res.result);
        meetingConfig.signature = res.result;
        meetingConfig.apiKey = API_KEY;
        var joinUrl =
          testTool.getCurrentDomain() +
          "/meeting.html?" +
          testTool.serialize(meetingConfig);
        $(element).attr("link", joinUrl);
        var $temp = $("<input>");
        $("body").append($temp);
        $temp.val($(element).attr("link")).select();
        document.execCommand("copy");
        $temp.remove();
      },
    });
  };


})();

// // 2020.10.26 Try to embed zoomMeeting UI inside heat-map container
// const zoomMeeting = document.getElementById("zmmtg-root");

// let container = document.getElementById("container");
// container.insertAdjacentElement("beforeend", zoomMeeting);