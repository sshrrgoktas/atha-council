import SafariServices
import SwiftUI

// The separate Council app uses Safari-managed OAuth. Never intercept tokens.
struct CouncilSafari: UIViewControllerRepresentable {
    @Binding var isPresented: Bool
    func makeCoordinator() -> Coordinator { Coordinator(isPresented: $isPresented) }
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let browser = SFSafariViewController(url: CouncilEndpoint.conversation)
        browser.delegate = context.coordinator
        browser.dismissButtonStyle = .done
        browser.preferredBarTintColor = UIColor(red: 8/255, green: 27/255, blue: 34/255, alpha: 1)
        browser.preferredControlTintColor = UIColor(red: 97/255, green: 216/255, blue: 202/255, alpha: 1)
        return browser
    }
    func updateUIViewController(_ browser: SFSafariViewController, context: Context) {}
    final class Coordinator: NSObject, SFSafariViewControllerDelegate {
        var isPresented: Binding<Bool>
        init(isPresented: Binding<Bool>) { self.isPresented = isPresented }
        func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
            isPresented.wrappedValue = false
        }
    }
}
