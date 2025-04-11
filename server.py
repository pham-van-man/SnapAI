from flask import Flask, request, jsonify
import os
from PIL import ImageGrab
import base64
import requests
import time

app = Flask(__name__)

exe_dir = os.path.dirname(os.path.abspath(__file__))

history = []
has_sent_image = False
previous_image_data = None

@app.route('/capture-image', methods=['POST'])
def capture_image():
    global previous_image_data
    try:
        timeout = 3
        start_time = time.time()
        new_image_data = None

        while time.time() - start_time < timeout:
            image = ImageGrab.grabclipboard()
            if image is not None:
                image_path = os.path.join(exe_dir, "screenshot_clipboard.png")
                image.save(image_path)
                with open(image_path, "rb") as img_file:
                    new_image_data = base64.b64encode(img_file.read()).decode("utf-8")
                os.remove(image_path)
                if previous_image_data is None or new_image_data != previous_image_data:
                    previous_image_data = new_image_data
                    break
            time.sleep(0.2)

        if new_image_data is None:
            return jsonify({"error": "Không tìm thấy hình ảnh mới trong clipboard."}), 500

        return jsonify({"image": new_image_data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
        
@app.route('/send-query', methods=['POST'])
def send_query():
    try:
        data = request.json
        image_data = data.get("image")
        rules = data.get("rules", "")
        api_key = data.get("apiKey")

        if not api_key:
            return jsonify({"error": "Chưa có API Key"}), 500

        add_user_message(image_data=image_data, text=rules)
        result, status = call_gemini_api(api_key)

        if status == 200:
            add_model_message(result)
            return jsonify({"result": result}), 200
        else:
            return jsonify({"error": result}), status

    except Exception as e:
        return jsonify({"error": str(e)}), 500
       
def add_user_message(image_data=None, text=None):
    global has_sent_image
    parts = []

    if image_data and not has_sent_image:
        parts.append({
            "inlineData": {
                "mimeType": "image/png",
                "data": image_data
            }
        })
        has_sent_image = True

    if text:
        parts.append({"text": text})
    
    history.append({
        "role": "user",
        "parts": parts
    })

def add_model_message(text):
    history.append({
        "role": "model",
        "parts": [
            {"text": text}
        ]
    })

def call_gemini_api(api_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    payload = {
        "contents": history 
    }
    response = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
    if response.status_code == 200:
        return response.json()["candidates"][0]["content"]["parts"][0]["text"], 200
    else:
        return response.json()["error"]["message"], response.status_code

@app.route('/reset', methods=['POST'])
def reset_history():
    global has_sent_image
    history.clear()
    has_sent_image = False
    return jsonify({"message": "Đã tạo hội thoại mới"})

if __name__ == "__main__":
    app.run(port=5000)