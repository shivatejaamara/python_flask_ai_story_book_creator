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
    # Folder where you keep panel images
    img_folder = os.path.join("static", "images")
    
    # Collect all PNG/JPG files
    files = sorted([
        f for f in os.listdir(img_folder)
        if f.lower().endswith((".png", ".jpg", ".jpeg"))
    ])
    
    if not files:
        return jsonify({"ok": False, "error": "No images found in comics folder"}), 400

    pdf_buffer = io.BytesIO()
    c = canvas.Canvas(pdf_buffer, pagesize=letter)

    for fname in files:
        img_path = os.path.join(img_folder, fname)
        img = Image.open(img_path)
        img_width, img_height = img.size

        # Scale to fit page
        page_width, page_height = letter
        aspect = img_width / img_height
        if aspect > 1:
            draw_width = page_width
            draw_height = page_width / aspect
        else:
            draw_height = page_height
            draw_width = page_height * aspect

        x = (page_width - draw_width) / 2
        y = (page_height - draw_height) / 2
        c.drawImage(img_path, x, y, width=draw_width, height=draw_height)
        c.showPage()

    c.save()

    pdf_bytes = pdf_buffer.getvalue()
    fname = "comic_book.pdf"
    out_path = os.path.join("static",fname)
    with open(out_path, "wb") as f:
        f.write(pdf_bytes)

    return jsonify({"ok": True, "url": f"/static/{fname}"})


if __name__ == "__main__":
    app.run(debug=True)

