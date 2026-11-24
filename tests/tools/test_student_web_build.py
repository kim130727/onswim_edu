import importlib.util
from pathlib import Path

import pytest

path = Path(__file__).resolve().parents[2] / "apps/mobile/scripts/build_student_web.py"
spec = importlib.util.spec_from_file_location("student_web_build", path)
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


def test_student_copy_dist_preserves_clean_bundle(tmp_path):
    dist, out = tmp_path / "dist", tmp_path / "student_app"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html><head></head><body>ok</body></html>", encoding="utf-8")
    (dist / "assets/index.js").write_text("console.log('student');", encoding="utf-8")
    build.copy_dist_to_django(dist, out)
    assert (out / "index.html").is_file()
    assert (out / "assets/index.js").is_file()


def test_student_bundle_check_rejects_problem_artifacts(tmp_path):
    (tmp_path / "index.html").write_text("<html></html>", encoding="utf-8")
    build.verify_bundle(tmp_path)
    (tmp_path / "private.renderer.json").write_text("{}", encoding="utf-8")
    with pytest.raises(RuntimeError, match="Private problem artifact"):
        build.verify_bundle(tmp_path)


def test_student_shell_has_no_problem_data_and_injects_base_href(client, monkeypatch, tmp_path):
    from modu_math_web.editor_next import views

    monkeypatch.setattr(views, "_student_asset_root", lambda: tmp_path)
    assert client.get("/student/").status_code == 503
    (tmp_path / "index.html").write_text(
        "<!doctype html><html><head><title>ModuMath</title></head><body></body></html>",
        encoding="utf-8",
    )
    response = client.get("/student/")
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-cache"
    assert '<base href="/static/editor_next/student_app/" />' in response.content.decode("utf-8")
