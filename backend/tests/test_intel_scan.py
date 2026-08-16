from services.intel import which_repos_use


def test_blob_match_is_meta_not_code(monkeypatch):
    monkeypatch.setattr(
        "services.intel.store.get_repos",
        lambda: [
            {
                "name": "NeuralVortex",
                "description": "fourier neural operator on vortex CFD",
                "language": "Python",
                "topics": [],
                "key_deps": {},
                "patterns": [],
            }
        ],
    )
    out = which_repos_use("fourier")
    assert out["hits"]
    assert out["hits"][0]["kind"] == "META"
    assert out["hits"][0]["repo"] == "NeuralVortex"


def test_declared_kind(monkeypatch):
    monkeypatch.setattr(
        "services.intel.store.get_repos",
        lambda: [{"name": "Lexprobe", "key_deps": {"fastapi": "0.115"}, "patterns": []}],
    )
    out = which_repos_use("fastapi")
    assert out["hits"][0]["kind"] == "DECLARED"
