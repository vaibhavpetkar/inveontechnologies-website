import type { ExerciseSeed } from "../types.js";

export default [
  {
    title: "Hello controller",
    brief: "Write a Spring Boot REST controller with one GET endpoint at /hello that returns a greeting.",
    steps: [
      "Annotate the class HelloController with @RestController",
      "Add a method annotated with @GetMapping(\"/hello\")",
      "The method returns the String \"Hello, Spring Boot!\"",
    ],
    level: "basic",
    editor: "java",
    starter: `import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

public class HelloController {

    // Add a GET /hello endpoint here
}
`,
    solution: `import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HelloController {

    @GetMapping("/hello")
    public String hello() {
        return "Hello, Spring Boot!";
    }
}
`,
    check: {
      rules: [
        { match: String.raw`@RestController\s+(public\s+)?class\s+HelloController\b`, message: "HelloController is annotated with @RestController" },
        { match: String.raw`@GetMapping\s*\(\s*((value|path)\s*=\s*)?"/hello"\s*\)`, message: "A method mapped with @GetMapping(\"/hello\")" },
        { match: String.raw`public\s+String\s+\w+\s*\(\s*\)`, message: "The method returns a String" },
        { match: String.raw`return\s+"Hello, Spring Boot!"\s*;`, message: "Returns \"Hello, Spring Boot!\"" },
      ],
    },
  },
  {
    title: "Greeting with PathVariable",
    brief: "Create a controller under /api with a GET /greet/{name} endpoint that greets the name from the URL.",
    steps: [
      "@RestController and @RequestMapping(\"/api\") on the class GreetingController",
      "@GetMapping(\"/greet/{name}\") on the method",
      "Read the name with @PathVariable String name",
      "Return \"Hello, \" + name (for /api/greet/Asha it returns Hello, Asha)",
    ],
    level: "basic",
    editor: "java",
    starter: `import org.springframework.web.bind.annotation.*;

@RestController
public class GreetingController {

    public String greet(String name) {
        return "Hello";
    }
}
`,
    solution: `import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class GreetingController {

    @GetMapping("/greet/{name}")
    public String greet(@PathVariable String name) {
        return "Hello, " + name;
    }
}
`,
    check: {
      rules: [
        { match: String.raw`@RequestMapping\s*\(\s*((value|path)\s*=\s*)?"/api/?"\s*\)`, message: "The class is mapped with @RequestMapping(\"/api\")" },
        { match: String.raw`@GetMapping\s*\(\s*((value|path)\s*=\s*)?"/greet/\{name\}"\s*\)`, message: "@GetMapping(\"/greet/{name}\")" },
        { match: String.raw`@PathVariable\s*(\(\s*((value|name)\s*=\s*)?"name"\s*\)\s*)?(final\s+)?String\s+name\b`, message: "Reads the name with @PathVariable String name" },
        { match: String.raw`return\s+("Hello, "\s*\+\s*name|String\.format\s*\(\s*"Hello, %s"\s*,\s*name\s*\))\s*;`, message: "Returns \"Hello, \" + name" },
      ],
    },
  },
  {
    title: "Add numbers with RequestParam",
    brief: "Write a GET /add endpoint that reads two query parameters, a and b, and returns their sum. b is optional and defaults to 0.",
    steps: [
      "@RestController class CalculatorController with @GetMapping(\"/add\")",
      "Read a with @RequestParam int a",
      "Read b with @RequestParam(defaultValue = \"0\") int b",
      "Return a + b as an int (GET /add?a=2&b=3 returns 5)",
    ],
    level: "basic",
    editor: "java",
    starter: `import org.springframework.web.bind.annotation.*;

@RestController
public class CalculatorController {

    @GetMapping("/add")
    public int add() {
        return 0;
    }
}
`,
    solution: `import org.springframework.web.bind.annotation.*;

@RestController
public class CalculatorController {

    @GetMapping("/add")
    public int add(@RequestParam int a, @RequestParam(defaultValue = "0") int b) {
        return a + b;
    }
}
`,
    check: {
      rules: [
        { match: String.raw`@GetMapping\s*\(\s*((value|path)\s*=\s*)?"/add"\s*\)`, message: "@GetMapping(\"/add\")" },
        { match: String.raw`@RequestParam\s*(\([^)]*\)\s*)?(int|Integer)\s+a\b`, message: "a is read with @RequestParam" },
        { match: String.raw`@RequestParam\s*\([^)]*defaultValue\s*=\s*"0"[^)]*\)\s*(int|Integer)\s+b\b`, message: "b uses @RequestParam(defaultValue = \"0\")" },
        { match: String.raw`return\s+a\s*\+\s*b\s*;`, message: "Returns a + b" },
      ],
    },
  },
  {
    title: "Configure application.properties",
    brief: "Write the application.properties for an app that runs on port 8081 and uses a local MySQL database called shop.",
    steps: [
      "server.port=8081",
      "spring.datasource.url=jdbc:mysql://localhost:3306/shop, plus spring.datasource.username and spring.datasource.password",
      "spring.jpa.hibernate.ddl-auto=update",
      "spring.jpa.show-sql=true",
    ],
    level: "basic",
    editor: "text",
    starter: `# Server
server.port=8080

# Database (MySQL)

# JPA
`,
    solution: `# Server
server.port=8081

# Database (MySQL)
spring.datasource.url=jdbc:mysql://localhost:3306/shop
spring.datasource.username=root
spring.datasource.password=secret

# JPA
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
`,
    check: {
      rules: [
        { match: String.raw`^[ \t]*server\.port[ \t]*[=:][ \t]*8081[ \t]*$`, flags: "m", message: "server.port=8081" },
        { match: String.raw`^[ \t]*spring\.datasource\.url[ \t]*[=:][ \t]*jdbc:mysql://(localhost|127\.0\.0\.1):3306/shop\b`, flags: "m", message: "spring.datasource.url points to jdbc:mysql://localhost:3306/shop" },
        { match: String.raw`^[ \t]*spring\.datasource\.username[ \t]*[=:][ \t]*\S+`, flags: "m", message: "spring.datasource.username is set" },
        { match: String.raw`^[ \t]*spring\.datasource\.password[ \t]*[=:]`, flags: "m", message: "spring.datasource.password is set" },
        { match: String.raw`^[ \t]*spring\.jpa\.hibernate\.ddl-auto[ \t]*[=:][ \t]*update[ \t]*$`, flags: "m", message: "spring.jpa.hibernate.ddl-auto=update" },
        { match: String.raw`^[ \t]*spring\.jpa\.show-sql[ \t]*[=:][ \t]*true[ \t]*$`, flags: "m", message: "spring.jpa.show-sql=true" },
      ],
    },
  },
  {
    title: "Product JPA entity",
    brief: "Turn the Product class into a JPA entity stored in the products table, with a generated id and a required name.",
    steps: [
      "@Entity and @Table(name = \"products\") on the class",
      "private Long id with @Id and @GeneratedValue(strategy = GenerationType.IDENTITY)",
      "private String name with @Column(nullable = false), and a private double price",
      "A public no-argument constructor public Product() {}",
    ],
    level: "intermediate",
    editor: "java",
    starter: `import jakarta.persistence.*;

public class Product {

    private Long id;

    private String name;

    private double price;

    // getters and setters
}
`,
    solution: `import jakarta.persistence.*;

@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    private double price;

    public Product() {}

    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public double getPrice() { return price; }
    public void setPrice(double price) { this.price = price; }
}
`,
    check: {
      rules: [
        { match: String.raw`@Entity\b[\s\S]*class\s+Product\b`, message: "Product is annotated with @Entity" },
        { match: String.raw`@Table\s*\(\s*name\s*=\s*"products"\s*\)`, message: "@Table(name = \"products\")" },
        { match: String.raw`@Id\b(\s*@\w+(\([^)]*\))?)*\s*private\s+(Long|long|Integer)\s+id\s*;`, message: "id is marked with @Id" },
        { match: String.raw`@GeneratedValue\s*\(\s*strategy\s*=\s*GenerationType\.IDENTITY\s*\)`, message: "@GeneratedValue(strategy = GenerationType.IDENTITY)" },
        { match: String.raw`@Column\s*\([^)]*nullable\s*=\s*false[^)]*\)\s*private\s+String\s+name\s*;`, message: "name has @Column(nullable = false)" },
        { match: String.raw`public\s+Product\s*\(\s*\)\s*\{`, message: "A public no-argument constructor" },
      ],
    },
  },
  {
    title: "Spring Data repository",
    brief: "Write a ProductRepository interface with Spring Data JPA and three derived query methods.",
    steps: [
      "public interface ProductRepository extends JpaRepository<Product, Long>",
      "List<Product> findByCategory(String category)",
      "List<Product> findByPriceLessThan(double price)",
      "Optional<Product> findByName(String name)",
    ],
    level: "intermediate",
    editor: "java",
    starter: `import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository {
    // Add the query methods here
}
`,
    solution: `import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository extends JpaRepository<Product, Long> {

    List<Product> findByCategory(String category);

    List<Product> findByPriceLessThan(double price);

    Optional<Product> findByName(String name);
}
`,
    check: {
      rules: [
        { match: String.raw`interface\s+ProductRepository\s+extends\s+JpaRepository\s*<\s*Product\s*,\s*Long\s*>`, message: "ProductRepository extends JpaRepository<Product, Long>" },
        { match: String.raw`List\s*<\s*Product\s*>\s+findByCategory\s*\(\s*String\s+\w+\s*\)\s*;`, message: "List<Product> findByCategory(String category)" },
        { match: String.raw`List\s*<\s*Product\s*>\s+findByPriceLessThan\s*\(\s*(double|Double|BigDecimal)\s+\w+\s*\)\s*;`, message: "List<Product> findByPriceLessThan(double price)" },
        { match: String.raw`Optional\s*<\s*Product\s*>\s+findByName\s*\(\s*String\s+\w+\s*\)\s*;`, message: "Optional<Product> findByName(String name)" },
      ],
    },
  },
  {
    title: "Create product with POST",
    brief: "Write a POST endpoint that saves a product from the JSON body and answers with status 201 Created.",
    steps: [
      "@RestController with @RequestMapping(\"/api/products\") on ProductController",
      "A method with @PostMapping that takes @RequestBody Product product",
      "Save it with the repository's save(...) method",
      "Respond with HttpStatus.CREATED (ResponseEntity.status(HttpStatus.CREATED).body(saved) or @ResponseStatus(HttpStatus.CREATED))",
    ],
    level: "intermediate",
    editor: "java",
    starter: `import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class ProductController {

    private final ProductRepository repository;

    public ProductController(ProductRepository repository) {
        this.repository = repository;
    }

    // Add the POST endpoint here
}
`,
    solution: `import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductRepository repository;

    public ProductController(ProductRepository repository) {
        this.repository = repository;
    }

    @PostMapping
    public ResponseEntity<Product> create(@RequestBody Product product) {
        Product saved = repository.save(product);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }
}
`,
    check: {
      rules: [
        { match: String.raw`@RequestMapping\s*\(\s*((value|path)\s*=\s*)?"/api/products/?"\s*\)`, message: "@RequestMapping(\"/api/products\") on the class" },
        { match: String.raw`@PostMapping\b`, message: "A method annotated with @PostMapping" },
        { match: String.raw`@RequestBody\s+(@\w+\s+)?Product\s+\w+`, message: "Takes @RequestBody Product" },
        { match: String.raw`\w+\.save\s*\(`, message: "Saves the product with save(...)" },
        { match: String.raw`HttpStatus\.CREATED`, message: "Responds with HttpStatus.CREATED" },
      ],
    },
  },
  {
    title: "Product service layer",
    brief: "Write a ProductService that uses constructor injection and wraps the repository's findAll and findById.",
    steps: [
      "Annotate the class with @Service",
      "A private final ProductRepository field set in the constructor public ProductService(ProductRepository repository) (no @Autowired field)",
      "public List<Product> findAll() returns repository.findAll()",
      "public Product findById(Long id) uses repository.findById(id).orElseThrow(...)",
    ],
    level: "intermediate",
    editor: "java",
    starter: `import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

public class ProductService {

    @Autowired
    private ProductRepository repository;

    public List<Product> findAll() {
        return null;
    }
}
`,
    solution: `import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class ProductService {

    private final ProductRepository repository;

    public ProductService(ProductRepository repository) {
        this.repository = repository;
    }

    public List<Product> findAll() {
        return repository.findAll();
    }

    public Product findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Product not found: " + id));
    }
}
`,
    check: {
      rules: [
        { match: String.raw`@Service\s+(public\s+)?class\s+ProductService\b`, message: "ProductService is annotated with @Service" },
        { match: String.raw`private\s+final\s+ProductRepository\s+\w+\s*;`, message: "A private final ProductRepository field" },
        { match: String.raw`public\s+ProductService\s*\(\s*ProductRepository\s+\w+\s*\)`, message: "The repository comes in through the constructor" },
        { notMatch: String.raw`@Autowired\s+private`, message: "No @Autowired field injection" },
        { match: String.raw`return\s+\w+\.findAll\s*\(\s*\)\s*;`, message: "findAll() returns repository.findAll()" },
        { match: String.raw`\.findById\s*\(\s*\w+\s*\)\s*\.orElseThrow\s*\(`, message: "findById uses orElseThrow" },
      ],
    },
  },
  {
    title: "Validate a request body",
    brief: "Add Bean Validation rules to a UserRequest class and make the POST /api/users endpoint validate it.",
    steps: [
      "name: @NotBlank and @Size(min = 3, max = 30)",
      "email: @NotBlank and @Email",
      "age: @Min(18)",
      "The controller method takes @Valid @RequestBody UserRequest request",
    ],
    level: "advanced",
    editor: "java",
    starter: `import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

class UserRequest {
    private String name;
    private String email;
    private int age;

    public String getName() { return name; }
}

@RestController
public class UserController {

    @PostMapping("/api/users")
    public ResponseEntity<String> create(@RequestBody UserRequest request) {
        return ResponseEntity.ok("Created " + request.getName());
    }
}
`,
    solution: `import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

class UserRequest {
    @NotBlank
    @Size(min = 3, max = 30)
    private String name;

    @NotBlank
    @Email
    private String email;

    @Min(18)
    private int age;

    public String getName() { return name; }
    public String getEmail() { return email; }
    public int getAge() { return age; }
}

@RestController
public class UserController {

    @PostMapping("/api/users")
    public ResponseEntity<String> create(@Valid @RequestBody UserRequest request) {
        return ResponseEntity.ok("Created " + request.getName());
    }
}
`,
    check: {
      rules: [
        { match: String.raw`@Size\s*\((?=[^)]*min\s*=\s*3\b)(?=[^)]*max\s*=\s*30\b)[^)]*\)(\s*@\w+(\([^)]*\))?)*\s*private\s+String\s+name\b`, message: "name has @Size(min = 3, max = 30)" },
        { match: String.raw`@NotBlank\b[\s\S]*@NotBlank\b`, message: "name and email are @NotBlank" },
        { match: String.raw`@Email\b(\s*\([^)]*\))?(\s*@\w+(\([^)]*\))?)*\s*private\s+String\s+email\b`, message: "email has @Email" },
        { match: String.raw`@Min\s*\(\s*(value\s*=\s*)?18\s*\)(\s*@\w+(\([^)]*\))?)*\s*private\s+(int|Integer)\s+age\b`, message: "age has @Min(18)" },
        { match: String.raw`@Valid\s+@RequestBody\s+UserRequest\b|@RequestBody\s+@Valid\s+UserRequest\b`, message: "The body is checked with @Valid @RequestBody" },
      ],
    },
  },
  {
    title: "Global exception handler",
    brief: "Create a ProductNotFoundException and a global handler that turns it into a 404 response with the error message.",
    steps: [
      "class ProductNotFoundException extends RuntimeException, with a constructor that calls super(message)",
      "A class annotated with @RestControllerAdvice (or @ControllerAdvice)",
      "A method with @ExceptionHandler(ProductNotFoundException.class)",
      "It returns ResponseEntity.status(HttpStatus.NOT_FOUND) with a body built from ex.getMessage()",
    ],
    level: "advanced",
    editor: "java",
    starter: `import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

class ProductNotFoundException {
}

public class GlobalExceptionHandler {
}
`,
    solution: `import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

class ProductNotFoundException extends RuntimeException {
    ProductNotFoundException(Long id) {
        super("Product " + id + " not found");
    }
}

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ProductNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(ProductNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }
}
`,
    check: {
      rules: [
        { match: String.raw`class\s+ProductNotFoundException\s+extends\s+RuntimeException\b`, message: "ProductNotFoundException extends RuntimeException" },
        { match: String.raw`\bsuper\s*\(`, message: "The exception passes its message to super(...)" },
        { match: String.raw`@(RestControllerAdvice|ControllerAdvice)\b`, message: "A class annotated with @RestControllerAdvice" },
        { match: String.raw`@ExceptionHandler\s*\(\s*(value\s*=\s*)?\{?\s*ProductNotFoundException\.class`, message: "@ExceptionHandler(ProductNotFoundException.class)" },
        { match: String.raw`HttpStatus\.NOT_FOUND`, message: "Responds with HttpStatus.NOT_FOUND" },
        { match: String.raw`\w+\.getMessage\s*\(\s*\)`, message: "The body uses the exception's getMessage()" },
      ],
    },
  },
] satisfies ExerciseSeed[];
