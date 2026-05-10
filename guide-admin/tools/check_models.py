import requests

API_KEY = "YOUR_GEMINI_API_KEY"  # Google Cloud Console で取得したキーを設定してください

def check_models():
    # v1betaを使って、現在使える全てのモデルを取得します
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}"
    response = requests.get(url)

    if response.status_code == 200:
        models = response.json().get('models', [])
        print("✅ 使用可能なモデル一覧:")
        for m in models:
            # 'models/gemini-...' という名前が表示されます
            print(f" - {m['name']}")
    else:
        print(f"❌ 診断失敗 ({response.status_code}): {response.text}")

if __name__ == "__main__":
    check_models()
