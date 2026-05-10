import os
import json
import requests
from bs4 import BeautifulSoup
from google import genai
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Union
import time

# ==========================================
# 1. 設定
# ==========================================
client = genai.Client(api_key="AIzaSyAHU3sR9V-K6D17ThAiVdBOlLhsxqTTGRY")
MODEL_NAME = "gemini-2.5-flash"

# 2. 出力データの構造定義
class ProductData(BaseModel):
    name: str
    maker: str
    price: Union[int, str]
    rank: int = Field(ge=1, le=5)
    spec_data: Dict[str, str]
    unique_selling_point: str
    script: str
    glossary: List[Dict[str, str]]

    # Pydantic側の設定（ここも重要）
    model_config = {'extra': 'forbid'}

def clean_schema(schema: Dict[str, Any]) -> Dict[str, Any]:
    """Gemini APIが嫌がる項目を、設計図から根こそぎ削除する関数"""
    if not isinstance(schema, dict):
        return schema

    # Geminiが拒否する3大項目を削除
    schema.pop('additionalProperties', None)
    schema.pop('title', None)
    schema.pop('default', None)

    for key, value in schema.items():
        if isinstance(value, dict):
            clean_schema(value)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    clean_schema(item)
    return schema

def scrape_website(url: str) -> str:
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        response = requests.get(url, headers=headers, timeout=15, verify=False)
        response.encoding = response.apparent_encoding
        soup = BeautifulSoup(response.text, 'html.parser')
        for s in soup(["script", "style"]):
            s.decompose()
        return soup.get_text(separator=' ', strip=True)
    except Exception as e:
        print(f"スクレイピング失敗: {e}")
        return ""

def convert_to_json(raw_text: str) -> ProductData:
    """お掃除した設計図を使ってGeminiを呼び出す"""

    # 1. Pydanticから生の設計図を作成
    raw_schema = ProductData.model_json_schema()

    # 2. 設計図をお掃除（Gemini専用仕様にする）
    fixed_schema = clean_schema(raw_schema)

    prompt = f"""
    以下の家電テキストから製品情報を抽出してください。
    - scriptは新人スタッフがそのまま店舗で使える説得力のあるセリフにすること。
    テキスト:
    {raw_text[:12000]}
    """

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config={
            'response_mime_type': 'application/json',
            'response_schema': fixed_schema,
        }
    )

    # 解析結果を ProductData 型として読み込む
    return ProductData.model_validate_json(response.text)

def main(url: str):
    print(f"【解析開始】モデル: {MODEL_NAME}")

    raw_text = scrape_website(url)
    if not raw_text:
        return

    try:
        time.sleep(1)
        product_data = convert_to_json(raw_text)

        # 保存（ファイル名に製品名を使用）
        filename = f"data/{product_data.name.replace(' ', '_')}.json"
        os.makedirs('data', exist_ok=True)
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(product_data.model_dump(), f, indent=2, ensure_ascii=False)

        print(f"✅ 成功！ 保存先: {filename}")
        print(f"--- おすすめセリフ ---\n{product_data.script}\n")

    except Exception as e:
        print(f"❌ 解析失敗: {e}")

if __name__ == "__main__":
    target_url = "https://www.toshiba-lifestyle.com/jp/microwaves/er-d7000b/"
    main(target_url)
