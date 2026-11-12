package com.atlascouncil.app;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Private LAN addresses and the fixed AthalAI HTTPS relay only. */
public final class ConnectionPolicy {
    public static final String REMOTE_ORIGIN = "https://athalai-mobile.sshrrgoktas.workers.dev";
    public static final String CHATGPT_URL = "https://chatgpt.com/";
    public static final String WORK_URL = "https://chatgpt.com/?surface=work";
    private static final String REMOTE_HOST = "athalai-mobile.sshrrgoktas.workers.dev";
    private ConnectionPolicy() {}

    public static URI parse(String input) {
        if (input == null || input.trim().length() > 256) throw new IllegalArgumentException();
        String value = input.trim();
        if (!value.contains("://")) value = (value.equalsIgnoreCase(REMOTE_HOST) || value.equalsIgnoreCase(REMOTE_HOST + "/") ? "https://" : "http://") + value;
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) ||
                uri.getUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null ||
                !(uri.getRawPath().isEmpty() || "/".equals(uri.getRawPath())) ||
                uri.getPort() < -1 || uri.getPort() == 0 || uri.getPort() > 65535) throw new IllegalArgumentException();
            if (!isPrivateIpv4(uri.getHost()) && !isRemote(uri)) throw new IllegalArgumentException();
            return new URI(scheme.toLowerCase(Locale.ROOT), null, uri.getHost().toLowerCase(Locale.ROOT), uri.getPort(), "/", null, null);
        } catch (URISyntaxException | NullPointerException e) { throw new IllegalArgumentException(); }
    }

    public static boolean isRemote(URI uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) &&
            REMOTE_HOST.equalsIgnoreCase(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    /** Open official ChatGPT in its existing app/browser session, never in this WebView. */
    public static boolean isOfficialChat(String destination) {
        if (destination == null || destination.length() > 512) return false;
        try {
            URI target = new URI(destination);
            if (!"https".equalsIgnoreCase(target.getScheme()) || !"chatgpt.com".equalsIgnoreCase(target.getHost()) ||
                target.getUserInfo() != null || target.getRawFragment() != null ||
                !(target.getPort() == -1 || target.getPort() == 443)) return false;
            String route = target.getRawPath(), query = target.getRawQuery();
            if (route.isEmpty() || "/".equals(route)) return query == null || "surface=work".equals(query);
            return query == null && route.matches("/c/[A-Za-z0-9_-]{8,128}");
        } catch (URISyntaxException | NullPointerException e) { return false; }
    }

    private static boolean isPrivateIpv4(String host) {
        if (host == null) return false;
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return false;
        int[] values = new int[4];
        for (int i = 0; i < 4; i++) {
            if (!parts[i].matches("[0-9]{1,3}")) return false;
            values[i] = Integer.parseInt(parts[i]);
            if (values[i] > 255 || !String.valueOf(values[i]).equals(parts[i])) return false;
        }
        return values[0] == 10 || (values[0] == 192 && values[1] == 168) ||
            (values[0] == 172 && values[1] >= 16 && values[1] <= 31);
    }

    public static boolean sameOrigin(URI origin, String destination) {
        if (origin == null || destination == null) return false;
        try {
            URI target = new URI(destination);
            return target.getUserInfo() == null && origin.getScheme().equalsIgnoreCase(target.getScheme()) &&
                origin.getHost().equalsIgnoreCase(target.getHost()) && effectivePort(origin) == effectivePort(target);
        } catch (URISyntaxException | NullPointerException e) { return false; }
    }
    private static int effectivePort(URI uri) {
        return uri.getPort() == -1 ? ("https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80) : uri.getPort();
    }
}
