"""DRF serializers for the document + graph API.

These are plain `Serializer`s (not `ModelSerializer`) because the data is
computed/validated, never persisted. Output serialization reads attributes off
the Pydantic domain objects returned by the service layer.
"""

from rest_framework import serializers


class DatasetDocumentSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    full_path = serializers.CharField()
    relative_path = serializers.CharField(default="")
    group_label = serializers.CharField(default="root")
    display_name = serializers.CharField(default="")
    origin = serializers.ChoiceField(choices=["dataset", "upload"])
    processed = serializers.BooleanField()


class NodeSerializer(serializers.Serializer):
    id = serializers.CharField()
    documentId = serializers.CharField()
    text = serializers.CharField(allow_blank=True)
    paragraph_enum = serializers.IntegerField()
    page = serializers.IntegerField()
    relationsCount = serializers.IntegerField(default=0)


class EdgeSerializer(serializers.Serializer):
    source = serializers.CharField()
    target = serializers.CharField()
    type = serializers.CharField()
    score = serializers.FloatField(required=False, allow_null=True)
    ref_label = serializers.CharField(required=False, allow_null=True)
    ref_value = serializers.CharField(required=False, allow_null=True)


class GraphSerializer(serializers.Serializer):
    nodes = NodeSerializer(many=True)
    edges = EdgeSerializer(many=True)


class ProcessElementSerializer(serializers.Serializer):
    id = serializers.CharField(required=False, allow_null=True)
    text = serializers.CharField(required=False, allow_blank=True, default="")


class ProcessPageSerializer(serializers.Serializer):
    pageNumber = serializers.IntegerField(required=False, allow_null=True)
    elements = ProcessElementSerializer(many=True, required=False, default=list)


class ProcessDocumentRequestSerializer(serializers.Serializer):
    documentId = serializers.CharField()
    pages = ProcessPageSerializer(many=True, required=False, default=list)


class ProcessCacheMetaSerializer(serializers.Serializer):
    enabled = serializers.BooleanField(default=False)
    hit = serializers.BooleanField(default=False)
    key = serializers.CharField(required=False, allow_null=True)


class ProcessDocumentResponseSerializer(serializers.Serializer):
    status = serializers.CharField(default="success")
    documentId = serializers.CharField()
    graph = GraphSerializer()
    cache = ProcessCacheMetaSerializer()
