import SwiftUI
import SafariServices

@main
struct AthaCouncilApp: App {
    var body: some Scene { WindowGroup { CouncilHome().preferredColorScheme(.dark) } }
}

struct CouncilHome: View {
    @State private var showCouncil = false
    @State private var ready: Bool?
    @State private var checking = false
    @State private var statusText = "Bağlantı kontrol edilmedi"
    private let aqua = Color(red: 97/255, green: 216/255, blue: 202/255)
    private let bg = Color(red: 8/255, green: 27/255, blue: 34/255)

    var body: some View {
        NavigationStack {
            ZStack {
                bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 26) {
                        Label("Atha Council", systemImage: "person.3.sequence.fill")
                            .font(.system(size: 29, weight: .bold))
                            .foregroundStyle(aqua)
                        Text("Atha Council bağımsız bir uygulamadır. Sohbet ve görevler yalnız Konsey hesabın üzerinden çalışır.")
                            .font(.body)
                        VStack(alignment: .leading, spacing: 12) {
                            Label(statusText, systemImage: ready == true ? "checkmark.circle.fill" : "wifi")
                                .font(.subheadline)
                            Button("Bağlantıyı yeniden kontrol et") { Task { await checkStatus() } }
                                .disabled(checking)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(18)
                        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
                        Button {
                            if CouncilEndpoint.official(CouncilEndpoint.conversation) { showCouncil = true }
                        } label: {
                            Label("Konsey sohbetini aç", systemImage: "bubble.left.and.bubble.right")
                                .font(.headline)
                                .frame(maxWidth: .infinity, minHeight: 56)
                                .foregroundStyle(bg)
                        }
                        .buttonStyle(.plain)
                        .background(aqua, in: RoundedRectangle(cornerRadius: 16))
                        ShareLink(item: CouncilEndpoint.conversation) {
                            Label("Konsey bağlantısını paylaş", systemImage: "square.and.arrow.up")
                        }.tint(aqua)
                        Text("Giriş Safari'nin güvenli tarayıcısında yapılır. Bu uygulama diğer uygulamanın çerezlerini, QR kodunu veya PC anahtarını okumaz.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }.padding(22).frame(maxWidth: 620).frame(maxWidth: .infinity)
                }
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $showCouncil) {
                CouncilSafari(isPresented: $showCouncil).ignoresSafeArea()
            }
            .task { await checkStatus() }
        }
        .tint(aqua)
    }

    @MainActor
    private func checkStatus() async {
        guard !checking, CouncilEndpoint.official(CouncilEndpoint.status) else { return }
        checking = true
        defer { checking = false }
        var request = URLRequest(url: CouncilEndpoint.status)
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  data.count <= 8192 else { throw URLError(.badServerResponse) }
            ready = try JSONDecoder().decode(CouncilServiceStatus.self, from: data).ready
            statusText = ready == true ? "Konsey sunucusu yanıt veriyor" : "Konsey hazır değil"
        } catch {
            ready = false
            statusText = "Sunucuya ulaşılamadı"
        }
    }
}
