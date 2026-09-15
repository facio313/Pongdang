"""Read-only classification of existing collected water places."""

# Classification uses provider categories, never a keyword search result alone.
# The original IDs, types, names, addresses and coordinates stay untouched.
PLACE_SELECT = """
SELECT s.id,s.name,s.type,s.address,s.region,s.lat,s.lng,
 CASE WHEN s.type IN ('beach','valley') THEN s.type
 WHEN EXISTS (SELECT 1 FROM pongdang_data.collection_place p WHERE p.spot_id=s.id
   AND ((p.provider='KAKAO_LOCAL' AND p.category LIKE '여행 > 관광,명소 > 해수욕장%%')
     OR (p.provider='TOURAPI_KOREAN' AND p.category='12'
         AND s.name ~ '(해수욕장|해변)$'))) THEN 'beach'
 WHEN EXISTS (SELECT 1 FROM pongdang_data.collection_place p WHERE p.spot_id=s.id
   AND ((p.provider='KAKAO_LOCAL' AND p.category LIKE '여행 > 관광,명소 > 계곡%%')
     OR (p.provider='TOURAPI_KOREAN' AND p.category='12'
         AND s.name ~ '계곡$'))) THEN 'valley'
 ELSE NULL END AS place_kind
FROM pongdang_data.spots_waterspot s
"""
