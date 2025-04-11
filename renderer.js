const { ipcRenderer } = require("electron");
const axios = require("axios");
const { marked } = require("marked");
const Swal = require("sweetalert2");

document.getElementById("capture").addEventListener("click", capture);
document.getElementById("resend").addEventListener("click", sendMessage);
document.getElementById("saveApiKey").addEventListener("click", saveApiKey);
document.getElementById("reset").addEventListener("click", resetConversation);
document.getElementById("rules").addEventListener("keydown", function (event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

ipcRenderer.on("trigger_capture", async () => {
  get_img();
});

async function resetConversation() {
  try {
    const response = await axios.post("http://localhost:5000/reset");
    if (response.status === 200) {
      showMessage(
        "Đã reset hội thoại",
        "Bạn có thể bắt đầu lại với một ảnh mới"
      );
      window.capturedImage = null;
      document.getElementById("imagePreview").src = "";
      document.getElementById("result").innerHTML =
        "⏳ Kết quả sẽ hiển thị ở đây...";
      document.getElementById("rules").value = "";
    }
  } catch (error) {
    handleErrorResponse(error.response);
  }
}

async function get_img() {
  ipcRenderer.send("show_main_windows");
  loading(true);
  try {
    await axios.post("http://localhost:5000/reset");
    const response = await axios.post("http://localhost:5000/capture-image");
    const imageBase64 = response.data.image;
    window.capturedImage = imageBase64;
    const imageElement = document.getElementById("imagePreview");
    imageElement.src = `data:image/png;base64,${imageBase64}`;
    document.getElementById("result").innerHTML =
      "⏳ Kết quả sẽ hiển thị ở đây...";
    document.getElementById("rules").value = "";
    loading(false);
  } catch (error) {
    loading(false);
    handleErrorResponse(error.response.data);
  }
}

window.onload = () => {
  ipcRenderer.invoke("get_api_key").then((apiKey) => {
    document.getElementById("apiKey").value = apiKey || "";
  });
};

function showMessage(title = "Thông báo", message) {
  Swal.fire({
    icon: "success",
    title: title,
    text: message,
    confirmButtonText: "OK",
  });
}
function saveApiKey() {
  const apiKey = document.getElementById("apiKey").value;
  if (apiKey) {
    ipcRenderer.send("save_api_key", apiKey);
    showMessage((message = "Đã lưu API Key"));
  } else {
    showError("Chưa có API Key");
  }
}

const oldLog = console.log;
console.log = (...args) => {
  ipcRenderer.send("log_from_renderer", args);
  oldLog(...args);
};

function showError(message) {
  Swal.fire({
    icon: "error",
    title: "Lỗi",
    text: message,
    confirmButtonText: "Đã hiểu",
  });
}

function handleErrorResponse({ status, data }) {
  switch (status) {
    case 400:
      showError("API Key không hợp lệ");
      break;
    case 500:
      showError(data.error);
    default:
      showError(data);
  }
}

function capture() {
  ipcRenderer.send("trigger_capture");
}

function loading(z) {
  if (z) {
    Swal.fire({
      title: "Đang xử lý...",
      text: "Vui lòng chờ trong giây lát...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });
  } else {
    Swal.close();
  }
}

async function sendMessage() {
  const rules = document.getElementById("rules").value;
  document.getElementById("rules").value = "";
  const apiKey = document.getElementById("apiKey").value;
  const image = window.capturedImage || null;
  ipcRenderer.send("show_main_windows");
  if (!apiKey) {
    showError("Chưa có API Key");
    return;
  }
  loading(true);
  try {
    const response = await axios.post("http://localhost:5000/send-query", {
      rules,
      apiKey,
      image,
    });
    document.getElementById("result").innerHTML = marked(response.data.result);
    loading(false);
  } catch (error) {
    loading(false);
    handleErrorResponse(error.response);
  }
}

document.getElementById("autostartToggle").addEventListener("change", (e) => {
  const enabled = e.target.checked;
  ipcRenderer.send("set_autostart", enabled);
});

ipcRenderer.on("autostart_status", (_, enabled) => {
  document.getElementById("autostartToggle").checked = enabled;
});
