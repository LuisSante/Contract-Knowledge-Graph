from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"status": "ok", "services": {"api": {"status": "ok"}}})


urlpatterns = [
    path("health", health),
    path("api/v1/", include("api.urls")),
]
