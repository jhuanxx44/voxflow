"""
素材库路由：素材列表、下载、管理员上传/删除
"""
"""Legacy local material-library endpoints retained for Web compatibility."""

import os
import mimetypes
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file

from config import MATERIALS_DIR, ADMIN_PASSWORD

materials_bp = Blueprint('materials', __name__)


@materials_bp.route('/materials', methods=['GET'])
def get_materials():
    """获取素材库列表"""
    try:
        materials = []
        for filename in os.listdir(MATERIALS_DIR):
            filepath = os.path.join(MATERIALS_DIR, filename)
            if os.path.isfile(filepath):
                stat = os.stat(filepath)
                materials.append({
                    "name": filename,
                    "size": stat.st_size,
                    "uploaded_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                })
        materials.sort(key=lambda x: x['uploaded_at'], reverse=True)
        return jsonify({"materials": materials})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@materials_bp.route('/materials/<path:filename>', methods=['GET'])
def download_material(filename):
    """下载素材文件"""
    try:
        print(f"=== 下载素材请求 ===")
        print(f"请求的文件名: {filename}")
        print(f"文件名类型: {type(filename)}")
        print(f"MATERIALS_DIR: {MATERIALS_DIR}")
        print(f"当前工作目录: {os.getcwd()}")

        if not os.path.exists(MATERIALS_DIR):
            print(f"材料目录不存在，创建目录: {MATERIALS_DIR}")
            os.makedirs(MATERIALS_DIR)
            return jsonify({"error": "Materials directory was empty"}), 404

        files_in_dir = os.listdir(MATERIALS_DIR) if os.path.exists(MATERIALS_DIR) else []
        print(f"目录内容: {files_in_dir}")

        filepath = os.path.abspath(os.path.join(MATERIALS_DIR, filename))
        print(f"完整文件路径: {filepath}")
        print(f"文件是否存在: {os.path.exists(filepath)}")

        # 如果文件不存在，尝试不区分大小写匹配
        if not os.path.exists(filepath):
            print(f"文件不存在，尝试不区分大小写匹配...")
            for f in files_in_dir:
                if f.lower() == filename.lower():
                    print(f"找到匹配文件（忽略大小写）: {f}")
                    filepath = os.path.abspath(os.path.join(MATERIALS_DIR, f))
                    break

        if not os.path.exists(filepath):
            return jsonify({
                "error": "Material not found",
                "requested": filename,
                "available": files_in_dir
            }), 404

        print(f"发送文件: {filepath}")
        mt = mimetypes.guess_type(filepath)[0] or 'application/octet-stream'
        print(f"MIME类型: {mt}")

        return send_file(filepath, mimetype=mt)
    except Exception as e:
        print(f"Error downloading material: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@materials_bp.route('/admin/upload', methods=['POST'])
def admin_upload():
    """管理员上传素材"""
    try:
        password = request.form.get('password', '')
        if password != ADMIN_PASSWORD:
            return jsonify({"error": "Invalid admin password"}), 403

        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400

        # 保存文件，保留中文文件名
        original_name = file.filename
        safe_name = original_name.replace('/', '_').replace('\\', '_').replace('..', '_')
        filepath = os.path.join(MATERIALS_DIR, safe_name)

        # 如果文件已存在，添加时间戳避免覆盖
        if os.path.exists(filepath):
            name, ext = os.path.splitext(safe_name)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_name = f"{name}_{timestamp}{ext}"
            filepath = os.path.join(MATERIALS_DIR, safe_name)

        file.save(filepath)

        return jsonify({
            "success": True,
            "filename": safe_name,
            "message": "Material uploaded successfully"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@materials_bp.route('/admin/delete/<path:filename>', methods=['DELETE'])
def admin_delete(filename):
    """管理员删除素材"""
    try:
        password = request.json.get('password', '') if request.json else ''
        if password != ADMIN_PASSWORD:
            return jsonify({"error": "Invalid admin password"}), 403

        filepath = os.path.join(MATERIALS_DIR, filename)

        print(f"尝试删除文件: {filepath}")
        print(f"文件是否存在: {os.path.exists(filepath)}")

        if not os.path.exists(filepath):
            print(f"目录内容: {os.listdir(MATERIALS_DIR)}")
            return jsonify({"error": "Material not found"}), 404

        os.remove(filepath)
        print(f"文件已删除: {filepath}")

        return jsonify({
            "success": True,
            "message": "Material deleted successfully"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
