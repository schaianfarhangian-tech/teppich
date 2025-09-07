import os

base_path = "images/nain_trading"
output = []

for idx, folder in enumerate(sorted(os.listdir(base_path)), start=1):
    img_name = f"{folder}-01.jpeg"
    img_path = f"{base_path}/{folder}/{img_name}"
    html = f'''  <tr>
    <td class="img-cell">
      <img src="{img_path}" alt="Teppich {idx}" />
    </td>
    <td data-label="Teppich Nr.">{1000+idx}</td>
    <td data-label="Größe"></td>
    <td data-label="Farbe"></td>
    <td data-label="Preis" class="price"></td>
  </tr>'''
    output.append(html)

with open("teppiche_rows.html", "w", encoding="utf-8") as f:
    f.write("\n".join(output))