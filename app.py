from flask import Flask, render_template, send_from_directory, request, jsonify
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from PIL import Image

import os, io, base64, json


app = Flask(__name__)



@app.route("/")
def index():
    return render_template("index.html")



@app.route("/editor")
def editor():
    return render_template("editor.html")

@app.route("/library.json")
def library_json():
    return send_from_directory("static/data", "library.json")

@app.route("/export", methods=["POST"])
def export_pdf():
    data = request.get_json()
    if not data or "images" not in data:
        return jsonify({"ok": False, "error": "No images provided"}), 400

    images = data["images"]

    pdf_buffer = io.BytesIO()
    c = canvas.Canvas(pdf_buffer)

    for img_data in images:
        img_bytes = base64.b64decode(img_data.split(",")[1])
        img = Image.open(io.BytesIO(img_bytes))
        img_width, img_height = img.size

        # Set page size to the image size
        c.setPageSize((img_width, img_height))

        # Draw the image to exactly fit the page (no borders)
        c.drawImage(ImageReader(io.BytesIO(img_bytes)), 0, 0, width=img_width, height=img_height)

        c.showPage()

    c.save()

    fname = "comic_book.pdf"
    out_path = os.path.join("static", fname)
    with open(out_path, "wb") as f:
        f.write(pdf_buffer.getvalue())

    return jsonify({"ok": True, "url": f"/static/{fname}"})




if __name__ == "__main__":
    app.run(debug=True)

