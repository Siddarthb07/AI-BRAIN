from services.manifests import parse_env_example, parse_package_json, parse_requirements


def test_parse_requirements():
    deps = parse_requirements("fastapi==0.115.0\n# comment\nhttpx>=0.27\n")
    assert deps["fastapi"] == "==0.115.0"
    assert "httpx" in deps


def test_parse_package_json():
    deps = parse_package_json('{"dependencies":{"next":"14.0.0"},"devDependencies":{"eslint":"8"}}')
    assert deps["next"] == "14.0.0"
    assert deps["eslint"] == "8"


def test_parse_env_example_names_only():
    names = parse_env_example("GROQ_API_KEY=\n# skip\nGITHUB_TOKEN=changeme\n")
    assert names == ["GROQ_API_KEY", "GITHUB_TOKEN"]
