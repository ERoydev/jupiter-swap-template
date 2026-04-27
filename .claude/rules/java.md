---
paths:
  - "**/*.java"
  - "**/*.kt"
  - "**/*.kts"
globs: ["*.java", "*.kt", "*.kts"]
alwaysApply: false
---
Java and Kotlin conventions — auto-loaded by Claude Code via `paths:` when reading .java, .kt, or .kts files. `globs:` kept for Cursor interop.

# Java / Kotlin Standards

## Project Structure

- **Maven standard layout**: `src/main/java`, `src/test/java`, `src/main/resources`, `src/test/resources`
- **Package = directory path** — `com.example.user` must live in `com/example/user/`
- **Test class in same package** as production class (for package-private access)
- **Test naming**: `{ClassName}Test.java` (not `Test{ClassName}`)
- **Kotlin test naming**: backtick function names for readability: `` fun `should reject negative amounts`() ``

## Testing (JUnit 5)

- **`@Test`** on every test method — no exceptions
- **`@BeforeEach` / `@AfterEach`** for setup/teardown (not JUnit 4 `@Before`/`@After`)
- **`@DisplayName("descriptive name")`** for human-readable test output
- Prefer **AssertJ** (`assertThat(result).isEqualTo(expected)`) or **JUnit 5** assertions (`assertEquals`, `assertThrows`)
- **Never `@Disabled` without a tracking reference** — `@Disabled("JIRA-1234")` is acceptable, bare `@Disabled` is not

## Error Handling

- **Unchecked exceptions** (`RuntimeException` subtypes) for programming errors
- **Checked exceptions** only for recoverable conditions the caller must handle
- **Never catch `Exception` or `Throwable` generically** — catches everything including `OutOfMemoryError`
- **Never use empty catch blocks** — at minimum log the exception
- **Wrap with context**: `throw new ServiceException("Failed to fetch user " + userId, cause)`
- **Kotlin**: prefer sealed classes or `Result` for expected failures over exceptions

## Dependency Injection

- **Constructor injection** over field injection — makes dependencies explicit and testable
- **Final fields** for injected dependencies (`private final UserRepository repo;`)
- **Kotlin**: `val` constructor parameters (equivalent to final fields)
- **Single-constructor autowiring** — no `@Autowired` annotation needed (Spring 4.3+)

```java
// Preferred: constructor injection with final fields
public class UserService {
    private final UserRepository repository;
    private final NotificationService notifications;

    public UserService(UserRepository repository, NotificationService notifications) {
        this.repository = repository;
        this.notifications = notifications;
    }
}
```

## Immutability

- **Java records** (16+) for DTOs and value objects: `public record UserResponse(String name, String email) {}`
- **Kotlin data classes** for the same purpose: `data class UserResponse(val name: String, val email: String)`
- **All fields `final`** (Java) or **`val`** (Kotlin) unless mutation is required
- **Builder pattern** for complex construction (Lombok `@Builder` or manual builder)

## Logging

- **SLF4J** as the logging facade — never use `System.out.println` in production code
- **Parameterized messages**: `log.info("User {} logged in from {}", userId, ip)` — not string concatenation
- **Never log sensitive data** — passwords, tokens, PII, full request bodies with credentials
